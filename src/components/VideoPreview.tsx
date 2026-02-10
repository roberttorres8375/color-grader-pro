"use client";

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
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
    const isPlayingRef = useRef(false);
    const paramsRef = useRef(params);
    const showComparisonRef = useRef(showComparison);
    const onFrameUpdateRef = useRef(onFrameUpdate);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [comparisonPos, setComparisonPos] = useState(0.5);
    const [isDraggingSlider, setIsDraggingSlider] = useState(false);
    const [videoReady, setVideoReady] = useState(false);

    // Keep refs in sync to avoid stale closures in the render loop
    paramsRef.current = params;
    showComparisonRef.current = showComparison;
    onFrameUpdateRef.current = onFrameUpdate;

    useEffect(() => {
      isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    useImperativeHandle(ref, () => ({
      getPixels: () => rendererRef.current?.readPixels() ?? null,
      getSize: () => rendererRef.current?.getSize() ?? { width: 0, height: 0 },
    }));

    // Initialize WebGL renderer - only once, canvas is always in the DOM
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const renderer = new WebGLRenderer();
      if (renderer.init(canvas)) {
        rendererRef.current = renderer;
      }

      return () => {
        cancelAnimationFrame(animFrameRef.current);
        renderer.destroy();
        rendererRef.current = null;
      };
    }, []);

    // Update shader when params change
    useEffect(() => {
      rendererRef.current?.updateShader(params);
    }, [params]);

    // Core render function - reads from refs, not state, to avoid stale closures
    const renderFrame = useCallback(() => {
      const video = videoRef.current;
      const renderer = rendererRef.current;
      const canvas = canvasRef.current;

      if (video && renderer && canvas && video.readyState >= 2) {
        // Resize canvas to match video dimensions
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          // Re-apply shader after resize (viewport changes)
          renderer.updateShader(paramsRef.current);
        }

        renderer.uploadFrame(video);
        renderer.render();

        // Render original for comparison
        if (showComparisonRef.current && originalCanvasRef.current) {
          const origCanvas = originalCanvasRef.current;
          if (origCanvas.width !== video.videoWidth || origCanvas.height !== video.videoHeight) {
            origCanvas.width = video.videoWidth;
            origCanvas.height = video.videoHeight;
          }
          const ctx = origCanvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0);
          }
        }

        onFrameUpdateRef.current?.();
      }
    }, []); // No deps - uses refs for everything

    // Animation loop for playback
    useEffect(() => {
      if (!isPlaying) return;

      let running = true;
      const loop = () => {
        if (!running) return;
        renderFrame();
        animFrameRef.current = requestAnimationFrame(loop);
      };
      animFrameRef.current = requestAnimationFrame(loop);

      return () => {
        running = false;
        cancelAnimationFrame(animFrameRef.current);
      };
    }, [isPlaying, renderFrame]);

    // Re-render when params change while paused
    useEffect(() => {
      if (!isPlaying && videoReady) {
        renderFrame();
      }
    }, [params, showComparison, isPlaying, videoReady, renderFrame]);

    // Handle video source change
    useEffect(() => {
      setVideoReady(false);
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
    }, [videoUrl]);

    const handleLoadedMetadata = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      setDuration(video.duration);
      // Seek to 0 to trigger first frame decode
      video.currentTime = 0;
    }, []);

    const handleSeeked = useCallback(() => {
      setVideoReady(true);
      // Compile shader if not yet done
      if (rendererRef.current) {
        rendererRef.current.updateShader(paramsRef.current);
      }
      renderFrame();
    }, [renderFrame]);

    const togglePlay = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;

      if (video.paused) {
        video.play();
        setIsPlaying(true);
      } else {
        video.pause();
        setIsPlaying(false);
        // Render the paused frame
        requestAnimationFrame(() => renderFrame());
      }
    }, [renderFrame]);

    const seek = useCallback(
      (time: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = time;
        setCurrentTime(time);
      },
      []
    );

    const formatTime = (t: number) => {
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      const f = Math.floor((t % 1) * 30);
      return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}:${f.toString().padStart(2, "0")}`;
    };

    return (
      <div className="flex-1 flex flex-col min-h-0">
        {/* Video viewport */}
        <div className="flex-1 relative bg-black flex items-center justify-center min-h-0 overflow-hidden">
          {/* Hidden video element - always in DOM */}
          <video
            ref={videoRef}
            src={videoUrl || undefined}
            className="hidden"
            onLoadedMetadata={handleLoadedMetadata}
            onSeeked={handleSeeked}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onEnded={() => setIsPlaying(false)}
            playsInline
            muted
          />

          {/* No-video placeholder */}
          {!videoUrl && (
            <div className="text-[#444] text-sm absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center">
                <svg
                  className="w-16 h-16 mx-auto mb-4 opacity-30"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="mb-1">Drop a video file here or click to upload</p>
                <p className="text-[11px] text-[#333]">Supports MP4, MOV, WebM</p>
              </div>
            </div>
          )}

          {/* Original canvas for comparison (behind graded) */}
          {showComparison && videoUrl && (
            <canvas
              ref={originalCanvasRef}
              className="absolute inset-0 w-full h-full"
              style={{
                objectFit: "contain",
                clipPath: `inset(0 ${(1 - comparisonPos) * 100}% 0 0)`,
              }}
            />
          )}

          {/* Graded preview canvas - ALWAYS in DOM for WebGL init */}
          <canvas
            ref={canvasRef}
            className={!videoUrl ? "hidden" : showComparison ? "absolute inset-0 w-full h-full" : "max-w-full max-h-full"}
            style={
              showComparison && videoUrl
                ? {
                    objectFit: "contain",
                    clipPath: `inset(0 0 0 ${comparisonPos * 100}%)`,
                  }
                : { objectFit: "contain" }
            }
          />

          {/* Comparison divider line */}
          {showComparison && videoUrl && (
            <div
              className="absolute top-0 bottom-0 w-[3px] bg-white cursor-ew-resize z-10"
              style={{ left: `${comparisonPos * 100}%` }}
              onPointerDown={(e) => {
                setIsDraggingSlider(true);
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!isDraggingSlider) return;
                const rect =
                  e.currentTarget.parentElement!.getBoundingClientRect();
                setComparisonPos(
                  Math.max(
                    0,
                    Math.min(1, (e.clientX - rect.left) / rect.width)
                  )
                );
              }}
              onPointerUp={() => setIsDraggingSlider(false)}
            >
              <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] text-white bg-black/60 px-2 py-0.5 rounded whitespace-nowrap pointer-events-none">
                Original
              </div>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-white bg-black/60 px-2 py-0.5 rounded whitespace-nowrap pointer-events-none">
                Graded
              </div>
              {/* Circle handle */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 bg-white rounded-full shadow-lg pointer-events-none flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 6L1 4M3 6L1 8M3 6H0M9 6L11 4M9 6L11 8M9 6H12" stroke="#333" strokeWidth="1.5"/>
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* Transport controls - always visible */}
        {videoUrl && (
          <div className="bg-[#111] border-t border-[#222] px-4 py-2 shrink-0">
            <div className="flex items-center gap-3">
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

              <span className="text-[11px] font-mono text-[#888] tabular-nums w-20">
                {formatTime(currentTime)}
              </span>

              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.033}
                value={currentTime}
                onChange={(e) => seek(parseFloat(e.target.value))}
                className="flex-1"
              />

              <span className="text-[11px] font-mono text-[#666] tabular-nums w-20 text-right">
                {formatTime(duration)}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }
);
