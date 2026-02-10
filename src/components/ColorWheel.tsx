"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import type { ColorWheelValue } from "@/lib/color-science";

interface ColorWheelProps {
  label: string;
  value: ColorWheelValue;
  onChange: (value: ColorWheelValue) => void;
}

export function ColorWheel({ label, value, onChange }: ColorWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const size = 120;
  const radius = size / 2 - 8;

  const drawWheel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    ctx.clearRect(0, 0, size, size);
    const cx = size / 2;
    const cy = size / 2;

    // Draw color wheel background
    for (let angle = 0; angle < 360; angle += 2) {
      const rad = (angle * Math.PI) / 180;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, "rgba(128, 128, 128, 0.3)");

      const h = angle;
      const s = 0.5;
      const l = 0.4;
      const rgb = hslToRgb(h / 360, s, l);
      gradient.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.3)`);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, rad, rad + (3 * Math.PI) / 180);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Ring border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Center crosshair
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    // Current position indicator
    // Map R/G/B offsets to wheel position
    // R pushes right, G pushes up-left, B pushes down-left (color triangle)
    const px = cx + (value.r - value.b) * radius * 1.5;
    const py = cy - (value.g - (value.r + value.b) / 2) * radius * 1.5;

    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fill();
  }, [value, size, radius]);

  useEffect(() => {
    drawWheel();
  }, [drawWheel]);

  const handlePointerEvent = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = size / 2;
      const cy = size / 2;

      const x = ((e.clientX - rect.left) / rect.width) * size - cx;
      const y = -((e.clientY - rect.top) / rect.height) * size + cy;

      // Clamp to circle
      const dist = Math.sqrt(x * x + y * y);
      const maxDist = radius;
      const scale = dist > maxDist ? maxDist / dist : 1;
      const nx = (x * scale) / (radius * 1.5);
      const ny = (y * scale) / (radius * 1.5);

      // Convert position to RGB offsets
      // This is a simplified mapping
      const r = nx * 0.5 + ny * 0.25;
      const g = ny * 0.5;
      const b = -nx * 0.5 + ny * 0.25;

      onChange({
        r: Math.max(-1, Math.min(1, r)),
        g: Math.max(-1, Math.min(1, g)),
        b: Math.max(-1, Math.min(1, b)),
        master: value.master,
      });
    },
    [onChange, radius, value.master, size]
  );

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-[#777] uppercase tracking-wider font-medium">
        {label}
      </span>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="color-wheel rounded-full"
        style={{ width: size / 1.5, height: size / 1.5 }}
        onPointerDown={(e) => {
          setIsDragging(true);
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          handlePointerEvent(e);
        }}
        onPointerMove={(e) => isDragging && handlePointerEvent(e)}
        onPointerUp={() => setIsDragging(false)}
        onDoubleClick={() =>
          onChange({ r: 0, g: 0, b: 0, master: value.master })
        }
      />
      <input
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={value.master}
        onChange={(e) =>
          onChange({ ...value, master: parseFloat(e.target.value) })
        }
        className="w-16"
        title="Master"
      />
    </div>
  );
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
