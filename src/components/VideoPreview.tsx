"use client";

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from "react";
import { WebGLRenderer } from "@/lib/webgl-renderer";
import type { GradingParams } from "@/lib/color-science";

export interface VideoPreviewHandle {
  getPixels: () => Uint8Array | null;
  getSize: () => { width: number; height: number };
}

interface VideoPreviewProps {
  videoUrl: string | null;
  params: GradingParams;
  showComparison: boolean;
  onFrameUpdate?: () => void;
}

export const VideoPreview = forwardRef<VideoPreviewHandle, VideoPreviewProps>(
  function VideoPreview({ videoUrl, params, showComparison, onFrameUpdate }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const originalCanvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<WebGLRenderer | null>(null);
    const animFrameRef = useRef<number>(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [comparisonPos, setComparisonPos] = useState(0.5);
    const [isDraggingSlider, setIsDraggingSlider] = useState(false);

    useImperativeHandle(ref, () => ({
      getPixels: () => rendererRef.current?.readPixels() ?? null,
      getSize: () => rendererRef.current?.getSize() ?? { width: 0, height: 0 },
    }));

    // Initialize WebGL renderer
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const renderer = new WebGLRenderer();
      if (renderer.init(canvas)) {
        rendererRef.current = renderer;
      }

      return () => {
        renderer.destroy();
        rendererRef.current = null;
      };
    }, []);

    // Update shader when params change
    useEffect(() => {
      rendererRef.current?.updateShader(params);
    }, [params]);

    // Render loop
    const renderFrame = useCallback(() => {
      const video = videoRef.current;
      const renderer = rendererRef.current;

      if (video && renderer && video.readyState >= 2) {
        // Resize canvas to match video
        const canvas = canvasRef.current!;
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        renderer.uploadFrame(video);
        renderer.render();

        // Also render original for comparison
        if (showComparison && originalCanvasRef.current) {
          const origCanvas = originalCanvasRef.current;
          origCanvas.width = video.videoWidth;
          origCanvas.height = video.videoHeight;
          const ctx = origCanvas.getContext("2d")!;
          ctx.drawImage(video, 0, 0);
        }

        onFrameUpdate?.();
      }

      if (isPlaying) {
        animFrameRef.current = requestAnimationFrame(renderFrame);
      }
    }, [isPlaying, showComparison, onFrameUpdate]);

    useEffect(() => {
      if (isPlaying) {
        animFrameRef.current = requestAnimationFrame(renderFrame);
      }
      return () => cancelAnimationFrame(animFrameRef.current);
    }, [isPlaying, renderFrame]);

    // Re-render on params change (even when paused)
    useEffect(() => {
      if (!isPlaying) {
        renderFrame();
      }
    }, [params, isPlaying, renderFrame]);

    const togglePlay = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;

      if (video.paused) {
        video.play();
        setIsPlaying(true);
      } else {
        video.pause();
        setIsPlaying(false);
        // Render current frame
        requestAnimationFrame(renderFrame);
      }
    }, [renderFrame]);

    const seek = useCallback(
      (time: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = time;
        setCurrentTime(time);
        if (!isPlaying) {
          // Wait for seek to complete then render
          video.onseeked = () => {
            renderFrame();
            video.onseeked = null;
          };
        }
      },
      [isPlaying, renderFrame]
    );

    const formatTime = (t: number) => {
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      const f = Math.floor((t % 1) * 30); // Assume 30fps for timecode
      return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}:${f.toString().padStart(2, "0")}`;
    };

    if (!videoUrl) {
      return (
        <div className="flex-1 flex items-center justify-center text-[#444] text-sm">
          <div className="text-center">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="mb-1">Drop a video file here or click to upload</p>
            <p className="text-[11px] text-[#333]">Supports MP4, MOV, WebM, AVI</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col min-h-0">
        {/* Video viewport */}
        <div className="flex-1 relative bg-black flex items-center justify-center min-h-0 overflow-hidden">
          <video
            ref={videoRef}
            src={videoUrl}
            className="hidden"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              setDuration(v.duration);
              // Render first frame
              v.currentTime = 0;
              v.onseeked = () => {
                renderFrame();
                v.onseeked = null;
              };
            }}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onEnded={() => setIsPlaying(false)}
            crossOrigin="anonymous"
            playsInline
            muted
          />

          {/* Comparison view */}
          {showComparison && (
            <canvas
              ref={originalCanvasRef}
              className="absolute inset-0 w-full h-full object-contain"
              style={{
                clipPath: `inset(0 ${(1 - comparisonPos) * 100}% 0 0)`,
              }}
            />
          )}

          {/* Graded preview */}
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-full object-contain"
            style={
              showComparison
                ? {
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    clipPath: `inset(0 0 0 ${comparisonPos * 100}%)`,
                  }
                : {}
            }
          />

          {/* Comparison divider */}
          {showComparison && (
            <div
              className="comparison-slider"
              style={{ left: `${comparisonPos * 100}%` }}
              onPointerDown={(e) => {
                setIsDraggingSlider(true);
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!isDraggingSlider) return;
                const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                setComparisonPos(
                  Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                );
              }}
              onPointerUp={() => setIsDraggingSlider(false)}
            >
              <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] text-white bg-black/60 px-2 py-0.5 rounded whitespace-nowrap">
                Original
              </div>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-white bg-black/60 px-2 py-0.5 rounded whitespace-nowrap">
                Graded
              </div>
            </div>
          )}
        </div>

        {/* Transport controls */}
        <div className="bg-[#111] border-t border-[#222] px-4 py-2">
          <div className="flex items-center gap-3">
            {/* Play button */}
            <button
              onClick={togglePlay}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#222] transition-colors"
            >
              {isPlaying ? (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Timecode */}
            <span className="text-[11px] font-mono text-[#888] tabular-nums w-20">
              {formatTime(currentTime)}
            </span>

            {/* Scrubber */}
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.033}
              value={currentTime}
              onChange={(e) => seek(parseFloat(e.target.value))}
              className="flex-1"
            />

            {/* Duration */}
            <span className="text-[11px] font-mono text-[#666] tabular-nums w-20 text-right">
              {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>
    );
  }
);
