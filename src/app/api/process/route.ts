import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { generateFFmpegFilterChain, type GradingParams } from "@/lib/color-science";

const execAsync = promisify(exec);

// Store processing status
const processingJobs = new Map<string, { status: string; progress: number; outputPath: string | null; error: string | null }>();

export async function POST(request: NextRequest) {
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

    // Create temp directories
    const tmpDir = path.join(process.cwd(), "tmp");
    const outputDir = path.join(process.cwd(), "public", "output");
    await mkdir(tmpDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });

    // Save input video
    const inputExt = path.extname(videoFile.name) || ".mp4";
    const inputPath = path.join(tmpDir, `${jobId}_input${inputExt}`);
    const outputPath = path.join(outputDir, `${jobId}_graded.mp4`);
    const arrayBuffer = await videoFile.arrayBuffer();
    await writeFile(inputPath, Buffer.from(arrayBuffer));

    // Save LUT if provided
    let lutPath: string | null = null;
    if (lutFile) {
      lutPath = path.join(tmpDir, `${jobId}_lut.cube`);
      const lutBuffer = await lutFile.arrayBuffer();
      await writeFile(lutPath, Buffer.from(lutBuffer));
    }

    // Initialize job status
    processingJobs.set(jobId, { status: "processing", progress: 0, outputPath: null, error: null });

    // Build FFmpeg command
    const filterChain = generateFFmpegFilterChain(params);

    // If we have a LUT, apply it after the filter chain
    let fullFilter = filterChain;
    if (lutPath) {
      fullFilter = fullFilter === "null"
        ? `lut3d='${lutPath}'`
        : `${fullFilter},lut3d='${lutPath}'`;
    }

    const ffmpegCmd = [
      "ffmpeg",
      "-y",
      "-i", `"${inputPath}"`,
      "-vf", `"${fullFilter}"`,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "18",
      "-c:a", "copy",
      "-movflags", "+faststart",
      `"${outputPath}"`,
    ].join(" ");

    // Run FFmpeg asynchronously
    processVideo(jobId, ffmpegCmd, inputPath, outputPath);

    return NextResponse.json({ jobId });
  } catch (error) {
    console.error("Process error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Processing failed" },
      { status: 500 }
    );
  }
}

async function processVideo(jobId: string, cmd: string, inputPath: string, outputPath: string) {
  try {
    console.log("FFmpeg command:", cmd);
    await execAsync(cmd, { maxBuffer: 1024 * 1024 * 10 });

    processingJobs.set(jobId, {
      status: "complete",
      progress: 100,
      outputPath: `/output/${path.basename(outputPath)}`,
      error: null,
    });

    // Cleanup input
    try { await unlink(inputPath); } catch { /* ignore */ }
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
