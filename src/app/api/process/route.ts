import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  generateFFmpegFilterChain,
  type GradingParams,
} from "@/lib/color-science";

const execFileAsync = promisify(execFile);

// In-memory job store (single-instance only)
const processingJobs = new Map<
  string,
  { status: string; progress: number; outputPath: string | null; error: string | null }
>();

export async function POST(request: NextRequest) {
  // Check if FFmpeg is available before processing
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try {
    const cp = require("child_process");
    cp.execFileSync("ffmpeg", ["-version"], { stdio: "pipe", timeout: 5000 });
  } catch {
    return NextResponse.json(
      { error: "FFmpeg not available on this server" },
      { status: 501 }
    );
  }

  try {
    const formData = await request.formData();
    const videoFile = formData.get("video") as File | null;
    const paramsJson = formData.get("params") as string | null;
    const lutFile = formData.get("lut") as File | null;

    if (!videoFile || !paramsJson) {
      return NextResponse.json({ error: "Missing video or params" }, { status: 400 });
    }

    const params: GradingParams = JSON.parse(paramsJson);
    const jobId = uuidv4();

    const tmpDir = path.join(process.cwd(), "tmp");
    const outputDir = path.join(process.cwd(), "public", "output");
    await mkdir(tmpDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });

    const inputExt = path.extname(videoFile.name) || ".mp4";
    const inputPath = path.join(tmpDir, `${jobId}_input${inputExt}`);
    const outputPath = path.join(outputDir, `${jobId}_graded.mp4`);
    const arrayBuffer = await videoFile.arrayBuffer();
    await writeFile(inputPath, Buffer.from(arrayBuffer));

    let lutPath: string | null = null;
    if (lutFile) {
      lutPath = path.join(tmpDir, `${jobId}_lut.cube`);
      const lutBuffer = await lutFile.arrayBuffer();
      await writeFile(lutPath, Buffer.from(lutBuffer));
    }

    processingJobs.set(jobId, { status: "processing", progress: 0, outputPath: null, error: null });

    let filterChain = generateFFmpegFilterChain(params);
    if (lutPath) {
      filterChain = filterChain === "null"
        ? `lut3d=${lutPath}`
        : `${filterChain},lut3d=${lutPath}`;
    }

    // Fire and forget - don't await
    processVideo(jobId, inputPath, outputPath, filterChain);

    return NextResponse.json({ jobId });
  } catch (error) {
    console.error("Process error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Processing failed" },
      { status: 500 }
    );
  }
}

async function processVideo(
  jobId: string,
  inputPath: string,
  outputPath: string,
  filterChain: string
) {
  try {
    // execFile avoids shell interpretation - no quoting issues with paths or filters
    const args = [
      "-y",
      "-i", inputPath,
      "-vf", filterChain,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "18",
      "-c:a", "copy",
      "-movflags", "+faststart",
      outputPath,
    ];

    console.log("FFmpeg args:", JSON.stringify(args));
    await execFileAsync("ffmpeg", args, { maxBuffer: 1024 * 1024 * 50 });

    processingJobs.set(jobId, {
      status: "complete",
      progress: 100,
      outputPath: `/output/${path.basename(outputPath)}`,
      error: null,
    });

    try { await unlink(inputPath); } catch { /* ok */ }
  } catch (error) {
    console.error("FFmpeg error:", error);
    processingJobs.set(jobId, {
      status: "error",
      progress: 0,
      outputPath: null,
      error: error instanceof Error ? error.message : "FFmpeg processing failed",
    });
  }
}

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }

  const job = processingJobs.get(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}
