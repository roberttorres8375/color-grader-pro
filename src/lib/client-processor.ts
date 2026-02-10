/**
 * Client-side video processing using FFmpeg.wasm
 * Used when server-side FFmpeg is not available (e.g., Vercel deployment)
 */

import { generateFFmpegFilterChain, type GradingParams } from "./color-science";

export type ProgressCallback = (progress: number, message: string) => void;

export async function processVideoClientSide(
  videoFile: File,
  params: GradingParams,
  onProgress: ProgressCallback
): Promise<Blob> {
  onProgress(5, "Loading FFmpeg...");

  // Dynamic import to avoid loading FFmpeg.wasm until needed
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { fetchFile } = await import("@ffmpeg/util");

  const ffmpeg = new FFmpeg();

  ffmpeg.on("progress", ({ progress }) => {
    const pct = Math.round(progress * 100);
    onProgress(Math.min(95, 10 + pct * 0.85), `Processing: ${pct}%`);
  });

  ffmpeg.on("log", ({ message }) => {
    console.log("[FFmpeg]", message);
  });

  onProgress(8, "Initializing FFmpeg...");
  await ffmpeg.load({
    coreURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js",
    wasmURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm",
  });

  onProgress(10, "Writing input file...");
  const inputName = "input" + getExtension(videoFile.name);
  const outputName = "output.mp4";

  await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

  // Build filter chain
  const filterChain = generateFFmpegFilterChain(params);

  onProgress(15, "Processing video...");

  const args = [
    "-i", inputName,
    "-vf", filterChain,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "copy",
    outputName,
  ];

  await ffmpeg.exec(args);

  onProgress(95, "Reading output...");
  const data = await ffmpeg.readFile(outputName);

  // Cleanup
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  onProgress(100, "Complete!");

  return new Blob([data as BlobPart], { type: "video/mp4" });
}

function getExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mov":
      return ".mov";
    case "webm":
      return ".webm";
    case "avi":
      return ".avi";
    case "mkv":
      return ".mkv";
    default:
      return ".mp4";
  }
}
