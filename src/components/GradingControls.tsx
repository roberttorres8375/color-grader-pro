"use client";

import { useState, useCallback } from "react";
import { Slider } from "./Slider";
import { ColorWheel } from "./ColorWheel";
import {
  DEFAULT_PARAMS,
  PRESETS,
  type GradingParams,
  type ColorWheelValue,
  type ColorBalance,
  type Preset,
} from "@/lib/color-science";

interface GradingControlsProps {
  params: GradingParams;
  onChange: (params: GradingParams) => void;
  onExportLUT: () => void;
  onImportLUT: (file: File) => void;
}

type Tab = "basic" | "wheels" | "curves" | "presets";

/** Linearly interpolate between two numbers */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolate between default and preset params at a given intensity (0-100) */
function interpolateParams(preset: Preset, intensity: number): GradingParams {
  const t = intensity / 100;
  const d = DEFAULT_PARAMS;
  const p = { ...DEFAULT_PARAMS, ...preset.params };

  const lerpWheel = (dw: ColorWheelValue, pw: ColorWheelValue): ColorWheelValue => ({
    r: lerp(dw.r, pw.r, t),
    g: lerp(dw.g, pw.g, t),
    b: lerp(dw.b, pw.b, t),
    master: lerp(dw.master, pw.master, t),
  });

  const lerpBalance = (db: ColorBalance, pb: ColorBalance): ColorBalance => ({
    r: lerp(db.r, pb.r, t),
    g: lerp(db.g, pb.g, t),
    b: lerp(db.b, pb.b, t),
  });

  return {
    exposure: lerp(d.exposure, p.exposure, t),
    contrast: lerp(d.contrast, p.contrast, t),
    contrastPivot: lerp(d.contrastPivot, p.contrastPivot, t),
    saturation: lerp(d.saturation, p.saturation, t),
    shadowsLevel: lerp(d.shadowsLevel, p.shadowsLevel, t),
    highlightsLevel: lerp(d.highlightsLevel, p.highlightsLevel, t),
    temperature: lerp(d.temperature, p.temperature, t),
    tint: lerp(d.tint, p.tint, t),
    lift: lerpWheel(d.lift, p.lift),
    gamma: lerpWheel(d.gamma, p.gamma),
    gain: lerpWheel(d.gain, p.gain),
    shadows: lerpBalance(d.shadows, p.shadows),
    midtones: lerpBalance(d.midtones, p.midtones),
    highlights: lerpBalance(d.highlights, p.highlights),
  };
}

export function GradingControls({
  params,
  onChange,
  onExportLUT,
  onImportLUT,
}: GradingControlsProps) {
  const [tab, setTab] = useState<Tab>("basic");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [presetIntensity, setPresetIntensity] = useState(100);

  const update = (partial: Partial<GradingParams>) => {
    setActivePreset(null);
    onChange({ ...params, ...partial });
  };

  const applyPreset = useCallback((preset: Preset) => {
    setActivePreset(preset.name);
    setPresetIntensity(100);
    onChange({ ...DEFAULT_PARAMS, ...preset.params });
  }, [onChange]);

  const handleIntensityChange = useCallback((intensity: number) => {
    setPresetIntensity(intensity);
    const preset = PRESETS.find((p) => p.name === activePreset);
    if (preset) {
      onChange(interpolateParams(preset, intensity));
    }
  }, [activePreset, onChange]);

  const resetAll = () => {
    setActivePreset(null);
    setPresetIntensity(100);
    onChange({ ...DEFAULT_PARAMS });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-[#2a2a2a] bg-[#141414]">
        {(["basic", "wheels", "presets"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider transition-colors ${
              tab === t
                ? "text-[#4a9eff] border-b-2 border-[#4a9eff] bg-[#4a9eff08]"
                : "text-[#666] hover:text-[#999] border-b-2 border-transparent"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tab === "basic" && (
          <>
            {/* Primary Corrections */}
            <Section title="Primary">
              <Slider
                label="Exposure"
                value={params.exposure}
                min={-4}
                max={4}
                step={0.05}
                unit=" EV"
                onChange={(v) => update({ exposure: v })}
              />
              <Slider
                label="Contrast"
                value={params.contrast}
                min={-100}
                max={100}
                step={1}
                onChange={(v) => update({ contrast: v })}
              />
              <Slider
                label="Saturation"
                value={params.saturation}
                min={0}
                max={200}
                step={1}
                defaultValue={100}
                unit="%"
                onChange={(v) => update({ saturation: v })}
              />
              <Slider
                label="Shadows"
                value={params.shadowsLevel}
                min={-100}
                max={100}
                step={1}
                onChange={(v) => update({ shadowsLevel: v })}
              />
              <Slider
                label="Highlights"
                value={params.highlightsLevel}
                min={-100}
                max={100}
                step={1}
                onChange={(v) => update({ highlightsLevel: v })}
              />
            </Section>

            {/* Color Temperature */}
            <Section title="White Balance">
              <Slider
                label="Temperature"
                value={params.temperature}
                min={-100}
                max={100}
                step={1}
                onChange={(v) => update({ temperature: v })}
              />
              <Slider
                label="Tint"
                value={params.tint}
                min={-100}
                max={100}
                step={1}
                onChange={(v) => update({ tint: v })}
              />
            </Section>

            {/* Shadows / Midtones / Highlights */}
            <Section title="Color Balance">
              <div className="space-y-2">
                <p className="text-[10px] text-[#555] uppercase tracking-wider">Shadows</p>
                <div className="grid grid-cols-3 gap-2">
                  <Slider label="R" value={params.shadows.r} min={-100} max={100} step={1} onChange={(v) => update({ shadows: { ...params.shadows, r: v } })} />
                  <Slider label="G" value={params.shadows.g} min={-100} max={100} step={1} onChange={(v) => update({ shadows: { ...params.shadows, g: v } })} />
                  <Slider label="B" value={params.shadows.b} min={-100} max={100} step={1} onChange={(v) => update({ shadows: { ...params.shadows, b: v } })} />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] text-[#555] uppercase tracking-wider">Midtones</p>
                <div className="grid grid-cols-3 gap-2">
                  <Slider label="R" value={params.midtones.r} min={-100} max={100} step={1} onChange={(v) => update({ midtones: { ...params.midtones, r: v } })} />
                  <Slider label="G" value={params.midtones.g} min={-100} max={100} step={1} onChange={(v) => update({ midtones: { ...params.midtones, g: v } })} />
                  <Slider label="B" value={params.midtones.b} min={-100} max={100} step={1} onChange={(v) => update({ midtones: { ...params.midtones, b: v } })} />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] text-[#555] uppercase tracking-wider">Highlights</p>
                <div className="grid grid-cols-3 gap-2">
                  <Slider label="R" value={params.highlights.r} min={-100} max={100} step={1} onChange={(v) => update({ highlights: { ...params.highlights, r: v } })} />
                  <Slider label="G" value={params.highlights.g} min={-100} max={100} step={1} onChange={(v) => update({ highlights: { ...params.highlights, g: v } })} />
                  <Slider label="B" value={params.highlights.b} min={-100} max={100} step={1} onChange={(v) => update({ highlights: { ...params.highlights, b: v } })} />
                </div>
              </div>
            </Section>
          </>
        )}

        {tab === "wheels" && (
          <Section title="Lift / Gamma / Gain">
            <div className="flex justify-around">
              <ColorWheel
                label="Lift"
                value={params.lift}
                onChange={(v) => update({ lift: v })}
              />
              <ColorWheel
                label="Gamma"
                value={params.gamma}
                onChange={(v) => update({ gamma: v })}
              />
              <ColorWheel
                label="Gain"
                value={params.gain}
                onChange={(v) => update({ gain: v })}
              />
            </div>
            <div className="text-center text-[10px] text-[#555] mt-2">
              Drag wheels to shift color. Double-click to reset. Slider controls master.
            </div>
          </Section>
        )}

        {tab === "presets" && (
          <>
            <Section title="Built-in Presets">
              <div className="grid grid-cols-2 gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => applyPreset(preset)}
                    className={`preset-btn ${
                      activePreset === preset.name ? "active" : ""
                    }`}
                  >
                    <div
                      className="w-full h-6 rounded mb-1.5"
                      style={{ background: preset.thumbnail || "#333" }}
                    />
                    <div className="font-medium text-[11px]">{preset.name}</div>
                    <div className="text-[10px] text-[#666] mt-0.5 leading-tight">
                      {preset.description}
                    </div>
                  </button>
                ))}
              </div>

              {/* Preset intensity slider */}
              {activePreset && (
                <div className="mt-3 pt-3 border-t border-[#2a2a2a]">
                  <Slider
                    label="Intensity"
                    value={presetIntensity}
                    min={0}
                    max={100}
                    step={1}
                    defaultValue={100}
                    unit="%"
                    onChange={handleIntensityChange}
                  />
                </div>
              )}
            </Section>

            <Section title="LUT">
              <div className="flex gap-2">
                <button onClick={onExportLUT} className="btn flex-1 text-[11px]">
                  Export .cube LUT
                </button>
                <label className="btn flex-1 text-[11px] text-center cursor-pointer">
                  Import .cube
                  <input
                    type="file"
                    accept=".cube"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onImportLUT(file);
                    }}
                  />
                </label>
              </div>
            </Section>
          </>
        )}
      </div>

      {/* Bottom actions */}
      <div className="border-t border-[#2a2a2a] p-3 flex gap-2">
        <button onClick={resetAll} className="btn flex-1 text-[11px]">
          Reset All
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[10px] text-[#555] uppercase tracking-wider font-semibold">
        {title}
      </h3>
      {children}
    </div>
  );
}
