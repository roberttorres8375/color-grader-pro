/**
 * Client-side video processing using WebGL + WebCodecs + mp4-muxer.
 *
 * Renders each frame through our WebGL color grading shader pipeline,
 * encodes to H.264 via the browser's hardware-accelerated WebCodecs VideoEncoder,
 * and muxes into a proper .mp4 file using mp4-muxer.
 *
 * No SharedArrayBuffer, no FFmpeg.wasm, no COOP/COEP headers needed.
 * Works in Chrome, Edge, and Safari (16.6+).
 */

import { generateGLSLFragmentShader, VERTEX_SHADER, type GradingParams } from "./color-science";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

export type ProgressCallback = (progress: number, message: string) => void;

export async function processVideoClientSide(
  videoFile: File,
  params: GradingParams,
  onProgress: ProgressCallback
): Promise<Blob> {
  // Check for WebCodecs support
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
    throw new Error(
      "Your browser does not support WebCodecs (needed for MP4 export). " +
      "Please use Chrome, Edge, or Safari 16.6+."
    );
  }

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

  onProgress(15, "Setting up H.264 encoder...");

  // Set up mp4-muxer
  const fps = 30;
  const totalFrames = Math.ceil(duration * fps);
  const frameDurationUs = Math.round(1_000_000 / fps); // microseconds per frame

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: "avc",
      width,
      height,
    },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  // Set up WebCodecs VideoEncoder
  let encoderError: Error | null = null;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => {
      encoderError = e;
      console.error("VideoEncoder error:", e);
    },
  });

  // Configure H.264 encoding
  // Use dimensions that are even (H.264 requires this)
  const encWidth = width % 2 === 0 ? width : width + 1;
  const encHeight = height % 2 === 0 ? height : height + 1;

  encoder.configure({
    codec: "avc1.640028", // H.264 High Profile Level 4.0
    width: encWidth,
    height: encHeight,
    bitrate: Math.min(width * height * 8, 10_000_000), // Scale with resolution, cap 10Mbps
    framerate: fps,
    latencyMode: "quality",
    avc: { format: "avc" }, // Annex B format for mp4-muxer
  });

  onProgress(20, "Processing frames...");

  // Process frame-by-frame
  const frameDuration = 1 / fps;

  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    if (encoderError) {
      throw encoderError;
    }

    const time = frameIdx * frameDuration;
    video.currentTime = Math.min(time, duration - 0.001);

    // Wait for the seek to complete
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

    // Create a VideoFrame from the canvas
    const frame = new VideoFrame(canvas, {
      timestamp: frameIdx * frameDurationUs,
      duration: frameDurationUs,
    });

    // Encode - request keyframe every 2 seconds
    const keyFrame = frameIdx % (fps * 2) === 0;
    encoder.encode(frame, { keyFrame });
    frame.close();

    // Backpressure: if encoder queue is getting deep, wait for it to catch up
    if (encoder.encodeQueueSize > 5) {
      await new Promise<void>((resolve) => {
        const check = () => {
          if (encoder.encodeQueueSize <= 2) {
            resolve();
          } else {
            setTimeout(check, 10);
          }
        };
        check();
      });
    }

    // Update progress
    const progress = 20 + (frameIdx / totalFrames) * 70;
    if (frameIdx % 10 === 0) {
      onProgress(
        Math.min(92, progress),
        `Frame ${frameIdx + 1}/${totalFrames}`
      );
    }
  }

  onProgress(93, "Flushing encoder...");

  // Flush the encoder to get all remaining frames
  await encoder.flush();
  encoder.close();

  if (encoderError) {
    throw encoderError;
  }

  onProgress(96, "Finalizing MP4...");

  // Finalize the MP4 file
  muxer.finalize();

  const mp4Buffer = (muxer.target as ArrayBufferTarget).buffer;
  const outputBlob = new Blob([mp4Buffer], { type: "video/mp4" });

  // Cleanup WebGL resources
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
