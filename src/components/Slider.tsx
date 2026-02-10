"use client";

import { useCallback } from "react";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  onChange: (value: number) => void;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue = 0,
  unit = "",
  onChange,
}: SliderProps) {
  const handleReset = useCallback(() => {
    onChange(defaultValue);
  }, [defaultValue, onChange]);

  const displayValue = step < 1 ? value.toFixed(2) : Math.round(value);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-[#999]">{label}</label>
        <span
          className="text-[11px] text-[#666] cursor-pointer hover:text-[#aaa] font-mono tabular-nums"
          onDoubleClick={handleReset}
          title="Double-click to reset"
        >
          {displayValue}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
