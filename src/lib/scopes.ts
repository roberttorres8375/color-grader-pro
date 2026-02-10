/**
 * Video Scopes: Histogram, Waveform, and Vectorscope
 *
 * Professional-grade scope implementations for color analysis.
 */

// ─── Histogram ────────────────────────────────────────────────────────────────

/**
 * Compute RGB histogram from pixel data.
 * Returns 256-bin arrays for R, G, B, and Luma channels.
 */
export function computeHistogram(
  pixels: Uint8Array,
  width: number,
  height: number,
  step: number = 2 // Sample every Nth pixel for performance
): { r: Uint32Array; g: Uint32Array; b: Uint32Array; luma: Uint32Array } {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const luma = new Uint32Array(256);

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const rv = pixels[i];
      const gv = pixels[i + 1];
      const bv = pixels[i + 2];

      r[rv]++;
      g[gv]++;
      b[bv]++;

      // Rec. 709 luma
      const l = Math.round(0.2126 * rv + 0.7152 * gv + 0.0722 * bv);
      luma[Math.min(255, l)]++;
    }
  }

  return { r, g, b, luma };
}

/**
 * Render histogram to a canvas.
 */
export function renderHistogram(
  ctx: CanvasRenderingContext2D,
  data: { r: Uint32Array; g: Uint32Array; b: Uint32Array; luma: Uint32Array },
  width: number,
  height: number
): void {
  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, width, height);

  // Grid lines
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const x = (width * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Find max value for normalization
  let maxVal = 1;
  for (let i = 1; i < 255; i++) { // Skip extremes for better scaling
    maxVal = Math.max(maxVal, data.r[i], data.g[i], data.b[i]);
  }

  const drawChannel = (hist: Uint32Array, color: string, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, height);

    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * width;
      const h = Math.min(height, (hist[i] / maxVal) * height * 0.9);
      ctx.lineTo(x, height - h);
    }

    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  };

  // Draw channels with blending
  ctx.globalCompositeOperation = "screen";
  drawChannel(data.r, "#ff4444", 0.7);
  drawChannel(data.g, "#44ff44", 0.7);
  drawChannel(data.b, "#4444ff", 0.7);

  // Luma overlay
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * width;
    const h = Math.min(height, (data.luma[i] / maxVal) * height * 0.9);
    if (i === 0) ctx.moveTo(x, height - h);
    else ctx.lineTo(x, height - h);
  }
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

// ─── Waveform ─────────────────────────────────────────────────────────────────

/**
 * Render waveform scope - shows brightness distribution per horizontal position.
 * This is the primary scope colorists use for exposure and balance.
 */
export function renderWaveform(
  ctx: CanvasRenderingContext2D,
  pixels: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  width: number,
  height: number,
  step: number = 2
): void {
  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, width, height);

  // Grid lines at 0%, 25%, 50%, 75%, 100% IRE
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.font = "9px monospace";
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";

  const levels = [0, 25, 50, 75, 100];
  for (const level of levels) {
    const y = height - (level / 100) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.fillText(`${level}`, 2, y - 2);
  }

  // Create an accumulation buffer for soft waveform rendering
  const buf = new Uint32Array(width * height * 3); // R, G, B planes

  for (let sy = 0; sy < srcHeight; sy += step) {
    for (let sx = 0; sx < srcWidth; sx += step) {
      const si = (sy * srcWidth + sx) * 4;
      const rv = pixels[si];
      const gv = pixels[si + 1];
      const bv = pixels[si + 2];

      const dx = Math.floor((sx / srcWidth) * width);

      const ryPos = Math.floor((1 - rv / 255) * (height - 1));
      const gyPos = Math.floor((1 - gv / 255) * (height - 1));
      const byPos = Math.floor((1 - bv / 255) * (height - 1));

      if (dx >= 0 && dx < width) {
        if (ryPos >= 0 && ryPos < height) buf[(ryPos * width + dx) * 3 + 0]++;
        if (gyPos >= 0 && gyPos < height) buf[(gyPos * width + dx) * 3 + 1]++;
        if (byPos >= 0 && byPos < height) buf[(byPos * width + dx) * 3 + 2]++;
      }
    }
  }

  // Render accumulation buffer
  const imageData = ctx.createImageData(width, height);
  const maxAccum = 20; // Brightness scaling factor

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bi = (y * width + x) * 3;
      const di = (y * width + x) * 4;

      const rIntensity = Math.min(1, buf[bi + 0] / maxAccum);
      const gIntensity = Math.min(1, buf[bi + 1] / maxAccum);
      const bIntensity = Math.min(1, buf[bi + 2] / maxAccum);

      // Mix with slight bloom effect
      imageData.data[di + 0] = Math.min(255, rIntensity * 255 * 1.2);
      imageData.data[di + 1] = Math.min(255, gIntensity * 255 * 1.2);
      imageData.data[di + 2] = Math.min(255, bIntensity * 255 * 1.2);
      imageData.data[di + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// ─── Vectorscope ──────────────────────────────────────────────────────────────

/**
 * Render vectorscope - shows color hue/saturation distribution.
 * Uses the YCbCr color model as in broadcast standards.
 */
export function renderVectorscope(
  ctx: CanvasRenderingContext2D,
  pixels: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  size: number,
  step: number = 3
): void {
  ctx.clearRect(0, 0, size, size);

  // Background
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 10;

  // Draw graticule (target boxes for standard colors)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1;

  // Circle outline
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Inner circles at 25%, 50%, 75%
  for (const pct of [0.25, 0.5, 0.75]) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * pct, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Crosshair
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.stroke();

  // Color target markers (SMPTE color bars positions)
  const targets = [
    { label: "R", angle: 103, dist: 0.7 },
    { label: "G", angle: 241, dist: 0.55 },
    { label: "B", angle: 347, dist: 0.65 },
    { label: "Yl", angle: 167, dist: 0.45 },
    { label: "Cy", angle: 283, dist: 0.52 },
    { label: "Mg", angle: 61, dist: 0.6 },
  ];

  ctx.font = "9px monospace";
  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  for (const t of targets) {
    const rad = (t.angle * Math.PI) / 180;
    const tx = cx + Math.cos(rad) * radius * t.dist;
    const ty = cy - Math.sin(rad) * radius * t.dist;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.strokeRect(tx - 5, ty - 5, 10, 10);
    ctx.fillText(t.label, tx + 8, ty + 3);
  }

  // Plot pixel data
  // Use accumulation buffer for density display
  const buf = new Uint32Array(size * size);

  for (let sy = 0; sy < srcHeight; sy += step) {
    for (let sx = 0; sx < srcWidth; sx += step) {
      const si = (sy * srcWidth + sx) * 4;
      const rv = pixels[si] / 255;
      const gv = pixels[si + 1] / 255;
      const bv = pixels[si + 2] / 255;

      // Convert to YCbCr (Rec. 709)
      const cb = -0.1687 * rv - 0.3313 * gv + 0.5 * bv;
      const cr = 0.5 * rv - 0.4187 * gv - 0.0813 * bv;

      // Map to scope coordinates
      const px = Math.round(cx + cr * radius * 2);
      const py = Math.round(cy - cb * radius * 2);

      if (px >= 0 && px < size && py >= 0 && py < size) {
        buf[py * size + px]++;
      }
    }
  }

  // Render with color
  const imageData = ctx.getImageData(0, 0, size, size);
  const maxDensity = 10;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const density = buf[y * size + x];
      if (density > 0) {
        const di = (y * size + x) * 4;
        const intensity = Math.min(1, density / maxDensity);

        // Color based on position (hue)
        const dx = (x - cx) / radius;
        const dy = (cy - y) / radius;

        // Map Cb/Cr back to approximate RGB for coloring
        const cr = dx / 2;
        const cb = dy / 2;
        const pr = 1.0 + 1.402 * cr;
        const pg = 1.0 - 0.344 * cb - 0.714 * cr;
        const pb = 1.0 + 1.772 * cb;

        imageData.data[di + 0] = Math.min(255, Math.max(0, pr * intensity * 200));
        imageData.data[di + 1] = Math.min(255, Math.max(0, pg * intensity * 200));
        imageData.data[di + 2] = Math.min(255, Math.max(0, pb * intensity * 200));
        imageData.data[di + 3] = 255;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}
