/**
 * Color Science Engine
 *
 * Professional color grading operations based on industry-standard formulas.
 * References: ASC CDL specification, DaVinci Resolve color model,
 * CIE color science, and the ACEScg working space.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GradingParams {
  // Primary corrections
  exposure: number;       // EV stops, multiplicative in linear light. Range: -4 to +4
  contrast: number;       // S-curve intensity. Range: -100 to +100
  contrastPivot: number;  // Pivot point for contrast (0.18 = middle gray). Range: 0.0 to 1.0
  saturation: number;     // Global saturation multiplier. Range: 0 to 200 (100 = no change)

  // Color temperature
  temperature: number;    // Warm/cool shift in mireds. Range: -100 to +100
  tint: number;           // Green/magenta shift. Range: -100 to +100

  // Lift / Gamma / Gain (3-way color corrector)
  // Each is {r, g, b, master} where r/g/b are offsets and master applies to all
  lift: ColorWheelValue;    // Shadows control
  gamma: ColorWheelValue;   // Midtones control
  gain: ColorWheelValue;    // Highlights control

  // Shadows / Midtones / Highlights with luminance-based isolation
  shadows: ColorBalance;
  midtones: ColorBalance;
  highlights: ColorBalance;
}

export interface ColorWheelValue {
  r: number;  // -1 to +1
  g: number;  // -1 to +1
  b: number;  // -1 to +1
  master: number; // -1 to +1
}

export interface ColorBalance {
  r: number;  // -100 to +100
  g: number;  // -100 to +100
  b: number;  // -100 to +100
}

export interface Preset {
  name: string;
  description: string;
  params: Partial<GradingParams>;
  thumbnail?: string; // CSS gradient for visual preview
}

// ─── Default Parameters ───────────────────────────────────────────────────────

export const DEFAULT_PARAMS: GradingParams = {
  exposure: 0,
  contrast: 0,
  contrastPivot: 0.18,
  saturation: 100,
  temperature: 0,
  tint: 0,
  lift:       { r: 0, g: 0, b: 0, master: 0 },
  gamma:      { r: 0, g: 0, b: 0, master: 0 },
  gain:       { r: 0, g: 0, b: 0, master: 0 },
  shadows:    { r: 0, g: 0, b: 0 },
  midtones:   { r: 0, g: 0, b: 0 },
  highlights: { r: 0, g: 0, b: 0 },
};

// ─── Presets ──────────────────────────────────────────────────────────────────

export const PRESETS: Preset[] = [
  {
    name: "Cinematic",
    description: "Teal & orange look with lifted shadows and desaturated midtones",
    thumbnail: "linear-gradient(135deg, #1a3a4a 0%, #2a1a0a 50%, #ff8844 100%)",
    params: {
      exposure: 0.1,
      contrast: 25,
      saturation: 85,
      temperature: 8,
      lift:  { r: 0.02, g: 0.06, b: 0.1, master: 0.05 },
      gamma: { r: -0.02, g: 0.0, b: 0.02, master: 0 },
      gain:  { r: 0.08, g: 0.02, b: -0.05, master: 0.02 },
    },
  },
  {
    name: "Vintage Film",
    description: "Faded blacks, warm highlights, and muted colors like expired film stock",
    thumbnail: "linear-gradient(135deg, #3a2a1a 0%, #8a7a5a 50%, #dac8a0 100%)",
    params: {
      exposure: 0.15,
      contrast: -15,
      saturation: 70,
      temperature: 15,
      tint: -5,
      lift:  { r: 0.08, g: 0.06, b: 0.04, master: 0.1 },
      gamma: { r: 0.03, g: 0.01, b: -0.02, master: 0.02 },
      gain:  { r: 0.04, g: 0.02, b: -0.04, master: -0.03 },
    },
  },
  {
    name: "Moody",
    description: "Dark, desaturated look with crushed shadows and cool tones",
    thumbnail: "linear-gradient(135deg, #0a0a1a 0%, #1a1a3a 50%, #3a3a5a 100%)",
    params: {
      exposure: -0.3,
      contrast: 35,
      saturation: 60,
      temperature: -15,
      lift:  { r: 0.01, g: 0.01, b: 0.05, master: -0.05 },
      gamma: { r: -0.02, g: -0.01, b: 0.03, master: -0.05 },
      gain:  { r: -0.03, g: 0.0, b: 0.04, master: -0.05 },
    },
  },
  {
    name: "Bleach Bypass",
    description: "High contrast, desaturated look emulating the bleach bypass process",
    thumbnail: "linear-gradient(135deg, #1a1a1a 0%, #5a5a5a 50%, #aaaaaa 100%)",
    params: {
      exposure: 0.05,
      contrast: 50,
      saturation: 40,
      temperature: -5,
      lift:  { r: 0.0, g: 0.0, b: 0.0, master: -0.08 },
      gamma: { r: 0.0, g: 0.0, b: 0.0, master: -0.03 },
      gain:  { r: 0.0, g: 0.0, b: 0.0, master: 0.1 },
    },
  },
  {
    name: "Golden Hour",
    description: "Warm, soft golden tones with gentle highlight rolloff",
    thumbnail: "linear-gradient(135deg, #4a2a0a 0%, #cc8833 50%, #ffddaa 100%)",
    params: {
      exposure: 0.2,
      contrast: 10,
      saturation: 110,
      temperature: 35,
      tint: -8,
      lift:  { r: 0.04, g: 0.02, b: -0.02, master: 0.03 },
      gamma: { r: 0.05, g: 0.02, b: -0.03, master: 0.02 },
      gain:  { r: 0.06, g: 0.03, b: -0.05, master: 0.0 },
    },
  },
  {
    name: "Moonlight",
    description: "Cool blue nighttime look with deep shadows",
    thumbnail: "linear-gradient(135deg, #050510 0%, #0a1a3a 50%, #2244aa 100%)",
    params: {
      exposure: -0.4,
      contrast: 20,
      saturation: 50,
      temperature: -40,
      tint: 5,
      lift:  { r: -0.02, g: 0.0, b: 0.08, master: -0.03 },
      gamma: { r: -0.03, g: 0.0, b: 0.05, master: -0.05 },
      gain:  { r: -0.05, g: 0.0, b: 0.1, master: -0.08 },
    },
  },
];

// ─── FFmpeg Filter Generation ─────────────────────────────────────────────────

/**
 * Generates an FFmpeg filter chain from grading parameters.
 *
 * The processing pipeline order:
 * 1. Exposure (multiplicative gain in linear-ish space via eq brightness)
 * 2. Lift/Gamma/Gain via curves and colorbalance
 * 3. Color temperature via colorbalance
 * 4. Contrast via curves (S-curve)
 * 5. Saturation via eq
 * 6. Shadows/Midtones/Highlights color balance
 */
export function generateFFmpegFilterChain(params: GradingParams): string {
  const filters: string[] = [];

  // 1. Exposure - use eq filter for brightness as EV stops
  // exposure = 2^EV, so EV=1 doubles brightness
  if (params.exposure !== 0) {
    const brightness = Math.pow(2, params.exposure);
    // eq brightness is additive (-1 to 1), but we want multiplicative
    // Use curves for true multiplicative exposure
    const r = Math.min(1, brightness);
    const g = Math.min(1, brightness);
    const b = Math.min(1, brightness);
    if (brightness <= 1) {
      filters.push(`curves=r='0/0 1/${r}':g='0/0 1/${g}':b='0/0 1/${b}'`);
    } else {
      // For overexposure, use lut to multiply
      const factor = brightness;
      filters.push(`lut=r='clip(val*${factor.toFixed(4)},0,255)':g='clip(val*${factor.toFixed(4)},0,255)':b='clip(val*${factor.toFixed(4)},0,255)'`);
    }
  }

  // 2. Lift/Gamma/Gain
  // Lift = offset added to shadows (ASC CDL offset)
  // Gain = multiplier (ASC CDL slope)
  // Gamma = power function (ASC CDL power)
  const hasLGG = [params.lift, params.gamma, params.gain].some(
    v => v.r !== 0 || v.g !== 0 || v.b !== 0 || v.master !== 0
  );

  if (hasLGG) {
    // Build per-channel curves for LGG
    // Formula: output = (gain * input + lift) ^ (1/gamma)
    // We approximate this with curves control points
    const channels = ['r', 'g', 'b'] as const;

    for (const ch of channels) {
      const lift = params.lift[ch] + params.lift.master;
      const gain = 1.0 + params.gain[ch] + params.gain.master;
      const gamma = 1.0 / (1.0 + params.gamma[ch] + params.gamma.master);

      // Generate curve points
      const points: string[] = [];
      const numPoints = 8;
      for (let i = 0; i <= numPoints; i++) {
        const x = i / numPoints;
        let y = gain * x + lift;
        y = Math.max(0, Math.min(1, y));
        if (gamma !== 1.0 && y > 0) {
          y = Math.pow(y, gamma);
        }
        y = Math.max(0, Math.min(1, y));
        points.push(`${x.toFixed(3)}/${y.toFixed(3)}`);
      }
      filters.push(`curves=${ch}='${points.join(" ")}'`);
    }
  }

  // 3. Color temperature
  // Warm = add red/yellow, reduce blue
  // Cool = add blue, reduce red/yellow
  if (params.temperature !== 0 || params.tint !== 0) {
    const temp = params.temperature / 100; // Normalize to -1..+1
    const tintVal = params.tint / 100;

    // Temperature affects blue/red balance
    // Tint affects green/magenta balance
    const rs = Math.max(-1, Math.min(1, temp * 0.3));
    const gs = Math.max(-1, Math.min(1, -temp * 0.1 + tintVal * 0.3));
    const bs = Math.max(-1, Math.min(1, -temp * 0.3));

    filters.push(`colorbalance=rs=${rs.toFixed(3)}:gs=${gs.toFixed(3)}:bs=${bs.toFixed(3)}:rm=${(rs * 0.5).toFixed(3)}:gm=${(gs * 0.5).toFixed(3)}:bm=${(bs * 0.5).toFixed(3)}:rh=${(rs * 0.3).toFixed(3)}:gh=${(gs * 0.3).toFixed(3)}:bh=${(bs * 0.3).toFixed(3)}`);
  }

  // 4. Contrast - S-curve around pivot point
  if (params.contrast !== 0) {
    const intensity = params.contrast / 100;
    const pivot = params.contrastPivot;

    // Generate S-curve points
    const points: string[] = [];
    const numPoints = 12;
    for (let i = 0; i <= numPoints; i++) {
      const x = i / numPoints;
      // Apply sigmoid-based contrast around pivot
      const normalized = (x - pivot);
      const curved = normalized * (1 + intensity * 1.5);
      let y = curved + pivot;
      y = Math.max(0, Math.min(1, y));
      points.push(`${x.toFixed(3)}/${y.toFixed(3)}`);
    }
    filters.push(`curves=all='${points.join(" ")}'`);
  }

  // 5. Saturation
  if (params.saturation !== 100) {
    const sat = params.saturation / 100;
    filters.push(`eq=saturation=${sat.toFixed(3)}`);
  }

  // 6. Shadows/Midtones/Highlights color balance
  const hasSMH = [params.shadows, params.midtones, params.highlights].some(
    v => v.r !== 0 || v.g !== 0 || v.b !== 0
  );

  if (hasSMH) {
    const s = params.shadows;
    const m = params.midtones;
    const h = params.highlights;
    filters.push(
      `colorbalance=` +
      `rs=${(s.r / 100).toFixed(3)}:gs=${(s.g / 100).toFixed(3)}:bs=${(s.b / 100).toFixed(3)}:` +
      `rm=${(m.r / 100).toFixed(3)}:gm=${(m.g / 100).toFixed(3)}:bm=${(m.b / 100).toFixed(3)}:` +
      `rh=${(h.r / 100).toFixed(3)}:gh=${(h.g / 100).toFixed(3)}:bh=${(h.b / 100).toFixed(3)}`
    );
  }

  return filters.length > 0 ? filters.join(",") : "null";
}

// ─── .cube LUT Generation ─────────────────────────────────────────────────────

/**
 * Generate a 3D LUT in .cube format from grading parameters.
 *
 * .cube format specification:
 * - Header with TITLE and LUT_3D_SIZE
 * - RGB triplets (0.0-1.0) for each grid point
 * - Blue varies fastest, then green, then red
 */
export function generateCubeLUT(params: GradingParams, size: number = 33): string {
  const lines: string[] = [];
  lines.push(`# Created by ColorGrader Pro`);
  lines.push(`TITLE "ColorGrader Export"`);
  lines.push(`LUT_3D_SIZE ${size}`);
  lines.push(`DOMAIN_MIN 0.0 0.0 0.0`);
  lines.push(`DOMAIN_MAX 1.0 1.0 1.0`);
  lines.push(``);

  for (let ri = 0; ri < size; ri++) {
    for (let gi = 0; gi < size; gi++) {
      for (let bi = 0; bi < size; bi++) {
        let r = ri / (size - 1);
        let g = gi / (size - 1);
        let b = bi / (size - 1);

        [r, g, b] = applyGradingToPixel(r, g, b, params);

        lines.push(`${r.toFixed(6)} ${g.toFixed(6)} ${b.toFixed(6)}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Parse a .cube LUT file and return the 3D LUT data.
 */
export function parseCubeLUT(content: string): { size: number; data: Float32Array } | null {
  const lines = content.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  let size = 0;
  const data: number[] = [];

  for (const line of lines) {
    if (line.startsWith("LUT_3D_SIZE")) {
      size = parseInt(line.split(/\s+/)[1]);
    } else if (line.startsWith("TITLE") || line.startsWith("DOMAIN_MIN") || line.startsWith("DOMAIN_MAX")) {
      continue;
    } else {
      const parts = line.split(/\s+/).map(Number);
      if (parts.length === 3 && !isNaN(parts[0])) {
        data.push(parts[0], parts[1], parts[2]);
      }
    }
  }

  if (size > 0 && data.length === size * size * size * 3) {
    return { size, data: new Float32Array(data) };
  }
  return null;
}

// ─── Per-Pixel Grading (for LUT generation) ───────────────────────────────────

function applyGradingToPixel(r: number, g: number, b: number, params: GradingParams): [number, number, number] {
  // 1. Exposure (multiplicative)
  const exposureMultiplier = Math.pow(2, params.exposure);
  r *= exposureMultiplier;
  g *= exposureMultiplier;
  b *= exposureMultiplier;

  // 2. Lift/Gamma/Gain
  // Formula: output = pow(max(0, gain * (input + lift * (1 - input))), 1/gamma)
  const applyLGG = (val: number, ch: 'r' | 'g' | 'b'): number => {
    const lift = params.lift[ch] + params.lift.master;
    const gainVal = 1.0 + params.gain[ch] + params.gain.master;
    const gammaVal = 1.0 + params.gamma[ch] + params.gamma.master;

    // Lift adds to shadows (affects low values more)
    let out = val + lift * (1.0 - val);
    // Gain multiplies
    out *= gainVal;
    // Gamma is power curve
    if (gammaVal !== 1.0 && out > 0) {
      out = Math.pow(out, 1.0 / gammaVal);
    }
    return Math.max(0, Math.min(1, out));
  };

  r = applyLGG(r, 'r');
  g = applyLGG(g, 'g');
  b = applyLGG(b, 'b');

  // 3. Color temperature
  if (params.temperature !== 0 || params.tint !== 0) {
    const temp = params.temperature / 100;
    const tintVal = params.tint / 100;

    r += temp * 0.1;
    g += tintVal * 0.1 - temp * 0.02;
    b -= temp * 0.1;
  }

  // 4. Contrast (S-curve around pivot)
  if (params.contrast !== 0) {
    const intensity = params.contrast / 100;
    const pivot = params.contrastPivot;

    const applyContrast = (val: number): number => {
      const normalized = val - pivot;
      const curved = normalized * (1 + intensity * 1.5);
      return Math.max(0, Math.min(1, curved + pivot));
    };

    r = applyContrast(r);
    g = applyContrast(g);
    b = applyContrast(b);
  }

  // 5. Saturation (luminance-weighted)
  if (params.saturation !== 100) {
    const sat = params.saturation / 100;
    // Rec. 709 luminance coefficients
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = luma + sat * (r - luma);
    g = luma + sat * (g - luma);
    b = luma + sat * (b - luma);
  }

  // 6. Shadows/Midtones/Highlights color balance
  const hasSMH = [params.shadows, params.midtones, params.highlights].some(
    v => v.r !== 0 || v.g !== 0 || v.b !== 0
  );
  if (hasSMH) {
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // Shadow weight: strongest for dark pixels
    const sw = 1.0 - smoothstep(0.0, 0.4, luma);
    // Midtone weight: bell curve centered at 0.5
    const mw = smoothstep(0.0, 0.4, luma) * (1.0 - smoothstep(0.6, 1.0, luma));
    // Highlight weight: strongest for bright pixels
    const hw = smoothstep(0.6, 1.0, luma);

    r += (params.shadows.r / 100) * sw + (params.midtones.r / 100) * mw + (params.highlights.r / 100) * hw;
    g += (params.shadows.g / 100) * sw + (params.midtones.g / 100) * mw + (params.highlights.g / 100) * hw;
    b += (params.shadows.b / 100) * sw + (params.midtones.b / 100) * mw + (params.highlights.b / 100) * hw;
  }

  return [
    Math.max(0, Math.min(1, r)),
    Math.max(0, Math.min(1, g)),
    Math.max(0, Math.min(1, b)),
  ];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ─── GLSL Shader for Real-Time Preview ────────────────────────────────────────

export function generateGLSLFragmentShader(params: GradingParams): string {
  return `
precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;

// Rec. 709 luminance
float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float smoothstepCustom(float edge0, float edge1, float x) {
  float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

void main() {
  vec3 color = texture2D(uTexture, vTexCoord).rgb;

  // 1. Exposure (multiplicative)
  color *= ${Math.pow(2, params.exposure).toFixed(6)};

  // 2. Lift/Gamma/Gain
  // Lift adds to shadows: color + lift * (1.0 - color)
  vec3 liftVal = vec3(${(params.lift.r + params.lift.master).toFixed(6)},
                      ${(params.lift.g + params.lift.master).toFixed(6)},
                      ${(params.lift.b + params.lift.master).toFixed(6)});
  vec3 gainVal = vec3(${(1.0 + params.gain.r + params.gain.master).toFixed(6)},
                      ${(1.0 + params.gain.g + params.gain.master).toFixed(6)},
                      ${(1.0 + params.gain.b + params.gain.master).toFixed(6)});
  vec3 gammaVal = vec3(${(1.0 / (1.0 + params.gamma.r + params.gamma.master)).toFixed(6)},
                       ${(1.0 / (1.0 + params.gamma.g + params.gamma.master)).toFixed(6)},
                       ${(1.0 / (1.0 + params.gamma.b + params.gamma.master)).toFixed(6)});

  color = color + liftVal * (1.0 - color);
  color *= gainVal;
  color = clamp(color, 0.0, 1.0);
  color = pow(color, gammaVal);

  // 3. Color temperature
  ${params.temperature !== 0 || params.tint !== 0 ? `
  float temp = ${(params.temperature / 100).toFixed(6)};
  float tintVal = ${(params.tint / 100).toFixed(6)};
  color.r += temp * 0.1;
  color.g += tintVal * 0.1 - temp * 0.02;
  color.b -= temp * 0.1;
  ` : '// No temperature shift'}

  // 4. Contrast (S-curve around pivot)
  ${params.contrast !== 0 ? `
  float contrastIntensity = ${(params.contrast / 100).toFixed(6)};
  float pivot = ${params.contrastPivot.toFixed(6)};
  color = (color - pivot) * (1.0 + contrastIntensity * 1.5) + pivot;
  ` : '// No contrast adjustment'}

  // 5. Saturation (luminance-weighted)
  ${params.saturation !== 100 ? `
  float sat = ${(params.saturation / 100).toFixed(6)};
  float luma = luminance(color);
  color = vec3(luma) + sat * (color - vec3(luma));
  ` : '// No saturation change'}

  // 6. Shadows/Midtones/Highlights balance
  ${[params.shadows, params.midtones, params.highlights].some(v => v.r !== 0 || v.g !== 0 || v.b !== 0) ? `
  float luma2 = luminance(color);
  float sw = 1.0 - smoothstepCustom(0.0, 0.4, luma2);
  float mw = smoothstepCustom(0.0, 0.4, luma2) * (1.0 - smoothstepCustom(0.6, 1.0, luma2));
  float hw = smoothstepCustom(0.6, 1.0, luma2);

  color.r += ${(params.shadows.r / 100).toFixed(6)} * sw + ${(params.midtones.r / 100).toFixed(6)} * mw + ${(params.highlights.r / 100).toFixed(6)} * hw;
  color.g += ${(params.shadows.g / 100).toFixed(6)} * sw + ${(params.midtones.g / 100).toFixed(6)} * mw + ${(params.highlights.g / 100).toFixed(6)} * hw;
  color.b += ${(params.shadows.b / 100).toFixed(6)} * sw + ${(params.midtones.b / 100).toFixed(6)} * mw + ${(params.highlights.b / 100).toFixed(6)} * hw;
  ` : '// No SMH balance'}

  // Clamp final output
  color = clamp(color, 0.0, 1.0);

  gl_FragColor = vec4(color, 1.0);
}
`;
}

export const VERTEX_SHADER = `
attribute vec2 aPosition;
attribute vec2 aTexCoord;
varying vec2 vTexCoord;
void main() {
  vTexCoord = aTexCoord;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;
