# ColorGrader Pro

Professional color grading tool for video production. Built with Next.js, WebGL, and FFmpeg.

![ColorGrader Pro](https://img.shields.io/badge/Built_with-Next.js_16-black?style=flat-square) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square)

## Features

### Core Grading
- **Exposure** - True EV stop adjustment (multiplicative in linear-ish space)
- **Contrast** - S-curve contrast with configurable pivot around middle gray (0.18)
- **Saturation** - Rec. 709 luminance-weighted for perceptually correct results
- **Color Temperature** - Warm/cool shift with tint control
- **Lift/Gamma/Gain** - 3-way color corrector with color wheels (industry standard)
- **Shadows/Midtones/Highlights** - Per-range RGB color balance with smooth transitions

### Real-Time Preview
- WebGL shader-based preview - adjustments render in real-time at full resolution
- GLSL fragment shader pipeline matches the export processing chain
- Before/after comparison slider

### Scopes
- **Histogram** - RGB + Luma overlay with proper Rec. 709 coefficients
- **Waveform** - Per-column brightness distribution (primary colorist scope)
- **Vectorscope** - YCbCr color hue/saturation distribution with SMPTE graticule

### Presets
6 built-in looks:
1. **Cinematic** - Teal & orange, lifted shadows, desaturated midtones
2. **Vintage Film** - Faded blacks, warm tones, muted colors (expired stock look)
3. **Moody** - Dark, desaturated, crushed shadows, cool tones
4. **Bleach Bypass** - High contrast, low saturation (chemical process emulation)
5. **Golden Hour** - Warm golden tones with gentle highlight rolloff
6. **Moonlight** - Cool blue nighttime look with deep shadows

### Export
- Full video processing via FFmpeg (libx264, CRF 18, fast preset)
- .cube 3D LUT export (33x33x33 standard format)
- .cube LUT import

## Setup

### Prerequisites
- Node.js 20+
- FFmpeg (required for video export)

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

### Install & Run

```bash
npm install
npm run dev
```

Open http://localhost:3000

### Build for Production

```bash
npm run build
npm start
```

## Usage

1. **Load video** - Drag & drop or click "Load Video"
2. **Adjust** - Use the Basic, Wheels, or Presets tabs
3. **Preview** - Changes render in real-time via WebGL
4. **Compare** - Press `C` or click "Compare" for before/after
5. **Export** - Click "Export Video" to process the full video
6. **LUT** - Export your grade as a .cube LUT for use in other tools

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `C` | Toggle before/after comparison |
| `R` | Reset all adjustments |
| Double-click value | Reset individual slider |

## Architecture

```
src/
├── app/
│   ├── page.tsx              # Main app layout & state
│   └── api/process/route.ts  # FFmpeg video processing endpoint
├── components/
│   ├── VideoPreview.tsx       # WebGL video preview + transport
│   ├── GradingControls.tsx    # All adjustment controls & presets
│   ├── ColorWheel.tsx         # Lift/Gamma/Gain color wheel
│   ├── Slider.tsx             # Reusable parameter slider
│   └── Scopes.tsx             # Histogram/Waveform/Vectorscope
└── lib/
    ├── color-science.ts       # Core grading engine, LUT gen, GLSL gen
    ├── webgl-renderer.ts      # WebGL shader compilation & rendering
    └── scopes.ts              # Scope computation & rendering
```

### Color Science

The grading pipeline processes in this order:
1. Exposure (multiplicative, emulating camera stops)
2. Lift/Gamma/Gain (ASC CDL-inspired: offset + slope + power)
3. Color temperature (RGB channel balance)
4. Contrast (S-curve around pivot point)
5. Saturation (Rec. 709 luminance-weighted)
6. Shadows/Midtones/Highlights balance (smoothstep-isolated ranges)

Two parallel implementations ensure preview matches export:
- **GLSL shader** for real-time WebGL preview
- **FFmpeg filter chain** for video export (curves, colorbalance, eq, lut)

## Tech Stack
- **Next.js 16** with App Router
- **TypeScript** for type safety
- **Tailwind CSS 4** for styling
- **WebGL** for real-time shader preview
- **FFmpeg** for video processing
- **Canvas 2D** for scope rendering
