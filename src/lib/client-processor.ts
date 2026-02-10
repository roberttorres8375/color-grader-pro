/**
 * Client-side video processing using WebGL + MediaRecorder.
 *
 * Renders each frame through our WebGL color grading shader pipeline,
 * then encodes the result with MediaRecorder (natively supported, no WASM needed).
 *
 * This works everywhere - no SharedArrayBuffer, no FFmpeg.wasm, no COOP/COEP headers.
 */

import { generateGLSLFragmentShader, VERTEX_SHADER, type GradingParams } from "./color-science";

export type ProgressCallback = (progress: number, message: string) => void;

export async function processVideoClientSide(
  videoFile: File,
  params: GradingParams,
  onProgress: ProgressCallback
): Promise<Blob> {
  onProgress(5, "Preparing video...");

  // Create a video element to decode the source
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  const videoUrl = URL.createObjectURL(videoFile);
  video.src = videoUrl;

  // Wait for video metadata
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Failed to load video"));
  });

  const width = video.videoWidth;
  const height = video.videoHeight;
  const duration = video.duration;

  if (!width || !height || !isFinite(duration) || duration <= 0) {
    URL.revokeObjectURL(videoUrl);
    throw new Error("Invalid video: cannot determine dimensions or duration");
  }

  onProgress(10, `Video: ${width}x${height}, ${duration.toFixed(1)}s`);

  // Create offscreen canvas for WebGL rendering
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  // Initialize WebGL
  const gl = canvas.getContext("webgl", {
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });

  if (!gl) {
    URL.revokeObjectURL(videoUrl);
    throw new Error("WebGL not available for export");
  }

  // Set up WebGL shader program
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, generateGLSLFragmentShader(params));
  if (!vs || !fs) {
    URL.revokeObjectURL(videoUrl);
    throw new Error("Failed to compile shaders for export");
  }

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    URL.revokeObjectURL(videoUrl);
    throw new Error("Shader program link failed");
  }

  // Create buffers (full-screen quad)
  const positionBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const texCoordBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]), gl.STATIC_DRAW);

  // Create texture
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  onProgress(15, "Setting up encoder...");

  // Use MediaRecorder to encode the output
  const stream = canvas.captureStream(0); // 0 = manual frame capture

  // Try to get best available codec
  const mimeTypes = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  let selectedMime = "";
  for (const mime of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mime)) {
      selectedMime = mime;
      break;
    }
  }

  if (!selectedMime) {
    URL.revokeObjectURL(videoUrl);
    throw new Error("No supported video encoding format found");
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: selectedMime,
    videoBitsPerSecond: Math.min(width * height * 8, 10_000_000), // Scale bitrate with resolution, cap at 10Mbps
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const recordingDone = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      const outputMime = selectedMime.split(";")[0]; // e.g., "video/webm"
      resolve(new Blob(chunks, { type: outputMime }));
    };
  });

  recorder.start();

  // Process frame-by-frame using requestVideoFrameCallback or seek-based approach
  onProgress(20, "Processing frames...");

  // Seek-based frame-by-frame processing
  const fps = 30; // Output at 30fps
  const totalFrames = Math.ceil(duration * fps);
  const frameDuration = 1 / fps;

  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    const time = frameIdx * frameDuration;
    video.currentTime = Math.min(time, duration - 0.001);

    // Wait for the seek to complete and frame to be available
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      video.addEventListener("seeked", onSeeked);
    });

    // Upload frame to WebGL texture
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    // Render with grading shader
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);

    const aPosition = gl.getAttribLocation(program, "aPosition");
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const aTexCoord = gl.getAttribLocation(program, "aTexCoord");
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.enableVertexAttribArray(aTexCoord);
    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);

    const uTexture = gl.getUniformLocation(program, "uTexture");
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uTexture, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Capture this frame to the MediaRecorder stream
    const track = stream.getVideoTracks()[0] as any;
    if (track && typeof track.requestFrame === "function") {
      track.requestFrame();
    }

    // Small delay to let MediaRecorder process the frame
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    // Update progress
    const progress = 20 + (frameIdx / totalFrames) * 75;
    if (frameIdx % 10 === 0) {
      onProgress(
        Math.min(95, progress),
        `Frame ${frameIdx + 1}/${totalFrames}`
      );
    }
  }

  onProgress(95, "Finalizing...");
  recorder.stop();

  const outputBlob = await recordingDone;

  // Cleanup
  gl.deleteTexture(texture);
  gl.deleteBuffer(positionBuffer);
  gl.deleteBuffer(texCoordBuffer);
  gl.deleteProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  URL.revokeObjectURL(videoUrl);

  onProgress(100, "Complete!");
  return outputBlob;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Export shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}
