"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { computeHistogram, renderHistogram, renderWaveform, renderVectorscope } from "@/lib/scopes";

interface ScopesProps {
  pixels: Uint8Array | null;
  width: number;
  height: number;
}

type ScopeMode = "histogram" | "waveform" | "vectorscope" | "parade";

export function Scopes({ pixels, width, height }: ScopesProps) {
  const histRef = useRef<HTMLCanvasElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const vecRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<ScopeMode>("histogram");

  const SCOPE_W = 280;
  const SCOPE_H = 160;

  const renderScopes = useCallback(() => {
    if (!pixels || width === 0 || height === 0) return;

    if (mode === "histogram" && histRef.current) {
      const ctx = histRef.current.getContext("2d")!;
      const data = computeHistogram(pixels, width, height, 3);
      renderHistogram(ctx, data, SCOPE_W, SCOPE_H);
    }

    if (mode === "waveform" && waveRef.current) {
      const ctx = waveRef.current.getContext("2d")!;
      renderWaveform(ctx, pixels, width, height, SCOPE_W, SCOPE_H, 3);
    }

    if (mode === "vectorscope" && vecRef.current) {
      const ctx = vecRef.current.getContext("2d")!;
      renderVectorscope(ctx, pixels, width, height, SCOPE_H, 4);
    }
  }, [pixels, width, height, mode]);

  useEffect(() => {
    renderScopes();
  }, [renderScopes]);

  return (
    <div className="panel">
      <div className="panel-header flex items-center justify-between">
        <span>Scopes</span>
        <div className="flex gap-1">
          {(["histogram", "waveform", "vectorscope"] as ScopeMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                mode === m
                  ? "bg-[#4a9eff22] text-[#4a9eff] border border-[#4a9eff44]"
                  : "text-[#666] hover:text-[#aaa] border border-transparent"
              }`}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="p-2 flex justify-center">
        {mode === "histogram" && (
          <canvas
            ref={histRef}
            width={SCOPE_W}
            height={SCOPE_H}
            className="scope-canvas rounded"
            style={{ width: SCOPE_W, height: SCOPE_H }}
          />
        )}
        {mode === "waveform" && (
          <canvas
            ref={waveRef}
            width={SCOPE_W}
            height={SCOPE_H}
            className="scope-canvas rounded"
            style={{ width: SCOPE_W, height: SCOPE_H }}
          />
        )}
        {mode === "vectorscope" && (
          <canvas
            ref={vecRef}
            width={SCOPE_H}
            height={SCOPE_H}
            className="scope-canvas rounded"
            style={{ width: SCOPE_H, height: SCOPE_H }}
          />
        )}
      </div>
    </div>
  );
}
