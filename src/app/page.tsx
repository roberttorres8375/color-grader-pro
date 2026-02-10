"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { VideoPreview, type VideoPreviewHandle } from "@/components/VideoPreview";
import { GradingControls } from "@/components/GradingControls";
import { Scopes } from "@/components/Scopes";
import {
  DEFAULT_PARAMS,
  generateCubeLUT,
  parseCubeLUT,
  type GradingParams,
} from "@/lib/color-science";

type ProcessingState = "idle" | "uploading" | "processing" | "complete" | "error";

export default function Home() {
  const [params, setParams] = useState<GradingParams>({ ...DEFAULT_PARAMS });
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [processingState, setProcessingState] = useState<ProcessingState>("idle");
  const [processingProgress, setProcessingProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scopePixels, setScopePixels] = useState<Uint8Array | null>(null);
  const [scopeSize, setScopeSize] = useState({ width: 0, height: 0 });
  const [isDragOver, setIsDragOver] = useState(false);

  const previewRef = useRef<VideoPreviewHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle video file selection
  const handleVideoFile = useCallback((file: File) => {
    // Revoke previous URL to avoid memory leak
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setVideoFile(file);
    setProcessingState("idle");
    setOutputUrl(null);
    setErrorMessage(null);
  }, [videoUrl]);

  // Drag & drop handling
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set false if we're leaving the container, not entering a child
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && (file.type.startsWith("video/") || file.name.match(/\.(mp4|mov|webm|avi|mkv)$/i))) {
        handleVideoFile(file);
      }
    },
    [handleVideoFile]
  );

  // Update scopes on frame render
  const handleFrameUpdate = useCallback(() => {
    if (previewRef.current) {
      const pixels = previewRef.current.getPixels();
      const size = previewRef.current.getSize();
      if (pixels && size.width > 0 && size.height > 0) {
        setScopePixels(pixels);
        setScopeSize(size);
      }
    }
  }, []);

  // Export graded video - tries server-side first, falls back to client-side FFmpeg.wasm
  const handleExport = useCallback(async () => {
    if (!videoFile) return;

    setProcessingState("uploading");
    setProcessingProgress(0);
    setErrorMessage(null);
    setOutputUrl(null);

    // Try server-side first (works in local dev with FFmpeg installed)
    try {
      const formData = new FormData();
      formData.append("video", videoFile);
      formData.append("params", JSON.stringify(params));

      const response = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Upload failed");
      }

      const { jobId } = await response.json();
      setProcessingState("processing");

      // Poll for completion with proper promise handling
      const waitForCompletion = (): Promise<string> => {
        return new Promise((resolve, reject) => {
          const poll = async () => {
            try {
              const statusRes = await fetch(`/api/process?jobId=${jobId}`);
              const status = await statusRes.json();

              if (status.status === "complete") {
                resolve(status.outputPath);
              } else if (status.status === "error") {
                reject(new Error(status.error || "Server processing failed"));
              } else {
                setProcessingProgress((prev) => Math.min(90, prev + 5));
                setTimeout(poll, 1500);
              }
            } catch (e) {
              reject(e);
            }
          };
          poll();
        });
      };

      const serverOutputPath = await waitForCompletion();
      setProcessingState("complete");
      setOutputUrl(serverOutputPath);
      setProcessingProgress(100);
      return; // Server export succeeded
    } catch (serverError) {
      console.warn("Server-side export failed, falling back to client-side:", serverError);
    }

    // Fall back to client-side FFmpeg.wasm
    try {
      setProcessingState("processing");
      setProcessingProgress(5);

      const { processVideoClientSide } = await import("@/lib/client-processor");

      const outputBlob = await processVideoClientSide(
        videoFile,
        params,
        (progress, message) => {
          setProcessingProgress(progress);
          console.log(`[Client FFmpeg] ${message}`);
        }
      );

      const url = URL.createObjectURL(outputBlob);
      setProcessingState("complete");
      setOutputUrl(url);
      setProcessingProgress(100);
    } catch (clientError) {
      console.error("Client-side export also failed:", clientError);
      setProcessingState("error");
      setErrorMessage(
        clientError instanceof Error ? clientError.message : "Export failed"
      );
    }
  }, [videoFile, params]);

  // Export LUT
  const handleExportLUT = useCallback(() => {
    const lut = generateCubeLUT(params, 33);
    const blob = new Blob([lut], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "colorgrader_export.cube";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [params]);

  // Import LUT
  const handleImportLUT = useCallback(async (file: File) => {
    const content = await file.text();
    const lut = parseCubeLUT(content);
    if (lut) {
      alert(
        `LUT imported: ${lut.size}x${lut.size}x${lut.size} (${lut.data.length / 3} entries). LUT will be applied during export.`
      );
    } else {
      alert("Failed to parse .cube LUT file. Check the file format.");
    }
  }, []);

  // Keyboard shortcuts - only fire when not focused on an input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "c" && !e.metaKey && !e.ctrlKey) {
        setShowComparison((v) => !v);
      }
      if (e.key === "r" && !e.metaKey && !e.ctrlKey) {
        setParams({ ...DEFAULT_PARAMS });
      }
      if (e.key === " " && !e.metaKey && !e.ctrlKey) {
        e.preventDefault(); // prevent page scroll
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div
      className="h-screen flex flex-col"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="drag-overlay pointer-events-none">
          Drop video file to load
        </div>
      )}

      {/* Top bar */}
      <header className="h-10 bg-[#111] border-b border-[#222] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold tracking-tight">
            <span className="text-[#4a9eff]">Color</span>Grader
            <span className="text-[10px] text-[#444] ml-1.5">Pro</span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowComparison(!showComparison)}
            className={`btn text-[11px] ${showComparison ? "btn-primary" : ""}`}
            title="Toggle before/after (C)"
          >
            {showComparison ? "Comparing" : "Compare"}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.mp4,.mov,.webm,.avi,.mkv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleVideoFile(file);
              // Reset so the same file can be selected again
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn text-[11px]"
          >
            Load Video
          </button>

          <button
            onClick={handleExport}
            disabled={
              !videoFile ||
              processingState === "processing" ||
              processingState === "uploading"
            }
            className="btn btn-primary text-[11px]"
          >
            {processingState === "uploading"
              ? "Uploading..."
              : processingState === "processing"
              ? "Processing..."
              : "Export Video"}
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Controls */}
        <aside className="w-[320px] border-r border-[#222] bg-[#141414] flex flex-col shrink-0">
          <GradingControls
            params={params}
            onChange={setParams}
            onExportLUT={handleExportLUT}
            onImportLUT={handleImportLUT}
          />
        </aside>

        {/* Center: Preview */}
        <main className="flex-1 flex flex-col min-w-0">
          <VideoPreview
            ref={previewRef}
            videoUrl={videoUrl}
            params={params}
            showComparison={showComparison}
            onFrameUpdate={handleFrameUpdate}
          />

          {/* Processing status */}
          {(processingState === "processing" ||
            processingState === "uploading") && (
            <div className="bg-[#111] border-t border-[#222] px-4 py-2 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-[#888]">
                  {processingState === "uploading"
                    ? "Uploading..."
                    : "Processing..."}
                </span>
                <div className="progress-bar flex-1">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${processingProgress}%` }}
                  />
                </div>
                <span className="text-[11px] text-[#666] font-mono">
                  {processingProgress}%
                </span>
              </div>
            </div>
          )}

          {processingState === "complete" && outputUrl && (
            <div className="bg-[#0a1a0a] border-t border-[#1a3a1a] px-4 py-2 flex items-center gap-3 shrink-0">
              <span className="text-[11px] text-[#4aff7a]">
                Export complete!
              </span>
              <a
                href={outputUrl}
                download={
                  videoFile
                    ? videoFile.name.replace(/\.[^.]+$/, "_graded.mp4")
                    : "graded_video.mp4"
                }
                className="btn btn-primary text-[11px]"
              >
                Download
              </a>
            </div>
          )}

          {processingState === "error" && errorMessage && (
            <div className="bg-[#1a0a0a] border-t border-[#3a1a1a] px-4 py-2 shrink-0">
              <span className="text-[11px] text-[#ff4a4a]">
                Error: {errorMessage}
              </span>
            </div>
          )}
        </main>

        {/* Right: Scopes */}
        <aside className="w-[300px] border-l border-[#222] bg-[#141414] flex flex-col shrink-0 overflow-y-auto">
          <Scopes
            pixels={scopePixels}
            width={scopeSize.width}
            height={scopeSize.height}
          />

          <div className="p-3 mt-auto border-t border-[#222]">
            <div className="text-[10px] text-[#444] space-y-1">
              <p className="font-medium text-[#555] uppercase tracking-wider mb-2">
                Shortcuts
              </p>
              <div className="flex justify-between">
                <span>Toggle compare</span>
                <kbd className="bg-[#222] px-1.5 rounded text-[9px]">C</kbd>
              </div>
              <div className="flex justify-between">
                <span>Reset all</span>
                <kbd className="bg-[#222] px-1.5 rounded text-[9px]">R</kbd>
              </div>
              <div className="flex justify-between">
                <span>Reset slider</span>
                <span className="text-[9px]">Double-click value</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
