/**
 * Client-side video processing using WebGL + WebCodecs + mp4-muxer.
 *
 * Renders each frame through our WebGL color grading shader pipeline,
 * encodes to H.264 via the browser's hardware-accelerated WebCodecs VideoEncoder,
 * extracts and re-encodes audio via Web Audio API + AudioEncoder (AAC),
 * and muxes both tracks into a proper .mp4 file using mp4-muxer.
 *
 * No SharedArrayBuffer, no FFmpeg.wasm, no COOP/COEP headers needed.
 * Works in Chrome, Edge, and Safari (16.6+).
 */

import { generateGLSLFragmentShader, VERTEX_SHADER, type GradingParams } from "./color-science";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

export type ProgressCallback = (progress: number, message: string) => void;

/**
 * Attempt to decode audio from the video file using Web Audio API.
 * Returns null if there's no audio track or decoding fails.
 */
async function extractAudio(
  videoFile: File,
  onProgress: ProgressCallback
): Promise<AudioBuffer | null> {
  try {
    onProgress(6, "Extracting audio...");
    const arrayBuffer = await videoFile.arrayBuffer();
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    try {
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      await audioCtx.close();
      return audioBuffer;
    } catch {
      // No audio track or unsupported audio codec - that's fine, export video-only
      await audioCtx.close();
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Check if AudioEncoder supports AAC encoding.
 */
async function isAACSupported(sampleRate: number, channels: number): Promise<boolean> {
  if (typeof AudioEncoder === "undefined") return false;
  try {
    const support = await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2",
      sampleRate,
      numberOfChannels: channels,
      bitrate: 128_000,
    });
    return support.supported === true;
  } catch {
    return false;
  }
}

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

  onProgress(8, `Video: ${width}x${height}, ${duration.toFixed(1)}s`);

  // Extract audio from source (runs in parallel conceptually, but we await it)
  const audioBuffer = await extractAudio(videoFile, onProgress);
  const hasAudio = audioBuffer !== null;

  // Determine audio encoding params
  const audioSampleRate = hasAudio ? audioBuffer.sampleRate : 0;
  const audioChannels = hasAudio ? Math.min(audioBuffer.numberOfChannels, 2) : 0; // Cap at stereo
  let canEncodeAAC = false;

  if (hasAudio) {
    canEncodeAAC = await isAACSupported(audioSampleRate, audioChannels);
    if (canEncodeAAC) {
      onProgress(10, `Audio: ${audioSampleRate}Hz, ${audioChannels}ch → AAC`);
    } else {
      onProgress(10, "Audio: AAC encoding not supported, exporting video only");
    }
  } else {
    onProgress(10, "No audio track detected");
  }

  const includeAudio = hasAudio && canEncodeAAC;

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

  onProgress(12, "Setting up encoders...");

  // Set up mp4-muxer with video + optional audio
  const fps = 30;
  const totalFrames = Math.ceil(duration * fps);
  const frameDurationUs = Math.round(1_000_000 / fps); // microseconds per frame

  const muxerOptions: ConstructorParameters<typeof Muxer>[0] = {
    target: new ArrayBufferTarget(),
    video: {
      codec: "avc",
      width,
      height,
    },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  };

  if (includeAudio) {
    muxerOptions.audio = {
      codec: "aac",
      numberOfChannels: audioChannels,
      sampleRate: audioSampleRate,
    };
  }

  const muxer = new Muxer(muxerOptions);

  // Set up WebCodecs VideoEncoder
  let videoEncoderError: Error | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => {
      videoEncoderError = e;
      console.error("VideoEncoder error:", e);
    },
  });

  // Use dimensions that are even (H.264 requires this)
  const encWidth = width % 2 === 0 ? width : width + 1;
  const encHeight = height % 2 === 0 ? height : height + 1;

  videoEncoder.configure({
    codec: "avc1.640028", // H.264 High Profile Level 4.0
    width: encWidth,
    height: encHeight,
    bitrate: Math.min(width * height * 8, 10_000_000),
    framerate: fps,
    latencyMode: "quality",
    avc: { format: "avc" },
  });

  // Set up AudioEncoder if we have audio
  let audioEncoderError: Error | null = null;
  let audioEncoder: AudioEncoder | null = null;

  if (includeAudio) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta);
      },
      error: (e) => {
        audioEncoderError = e;
        console.error("AudioEncoder error:", e);
      },
    });

    audioEncoder.configure({
      codec: "mp4a.40.2", // AAC-LC
      sampleRate: audioSampleRate,
      numberOfChannels: audioChannels,
      bitrate: 128_000,
    });
  }

  // Encode audio in chunks before processing video frames
  // This avoids interleaving complexity - mp4-muxer handles timestamp ordering
  if (includeAudio && audioEncoder && audioBuffer) {
    onProgress(14, "Encoding audio...");

    const totalSamples = audioBuffer.length;
    // Process audio in chunks of ~1024 samples (standard AAC frame size)
    const chunkSize = 1024;
    const numChunks = Math.ceil(totalSamples / chunkSize);

    for (let i = 0; i < numChunks; i++) {
      if (audioEncoderError) throw audioEncoderError;

      const offset = i * chunkSize;
      const length = Math.min(chunkSize, totalSamples - offset);

      // Create interleaved Float32Array for AudioData
      const interleaved = new Float32Array(length * audioChannels);
      for (let ch = 0; ch < audioChannels; ch++) {
        const channelData = audioBuffer.getChannelData(ch);
        for (let s = 0; s < length; s++) {
          interleaved[s * audioChannels + ch] = channelData[offset + s];
        }
      }

      const audioData = new AudioData({
        format: "f32",  // interleaved float32
        sampleRate: audioSampleRate,
        numberOfFrames: length,
        numberOfChannels: audioChannels,
        timestamp: Math.round((offset / audioSampleRate) * 1_000_000), // microseconds
        data: interleaved,
      });

      audioEncoder.encode(audioData);
      audioData.close();

      // Backpressure
      if (audioEncoder.encodeQueueSize > 10) {
        await new Promise<void>((resolve) => {
          const check = () => {
            if (!audioEncoder || audioEncoder.encodeQueueSize <= 5) {
              resolve();
            } else {
              setTimeout(check, 5);
            }
          };
          check();
        });
      }

      // Progress updates for audio encoding phase (14-18%)
      if (i % 100 === 0) {
        const audioProgress = 14 + (i / numChunks) * 4;
        onProgress(Math.min(18, audioProgress), `Audio chunk ${i + 1}/${numChunks}`);
      }
    }

    // Flush audio encoder
    onProgress(18, "Flushing audio encoder...");
    await audioEncoder.flush();
  }

  onProgress(20, "Processing video frames...");

  // Process video frame-by-frame
  const frameDuration = 1 / fps;

  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    if (videoEncoderError) throw videoEncoderError;

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
    videoEncoder.encode(frame, { keyFrame });
    frame.close();

    // Backpressure
    if (videoEncoder.encodeQueueSize > 5) {
      await new Promise<void>((resolve) => {
        const check = () => {
          if (videoEncoder.encodeQueueSize <= 2) {
            resolve();
          } else {
            setTimeout(check, 10);
          }
        };
        check();
      });
    }

    // Update progress (20-92%)
    const progress = 20 + (frameIdx / totalFrames) * 72;
    if (frameIdx % 10 === 0) {
      onProgress(
        Math.min(92, progress),
        `Frame ${frameIdx + 1}/${totalFrames}`
      );
    }
  }

  onProgress(93, "Flushing video encoder...");

  // Flush the video encoder
  await videoEncoder.flush();
  videoEncoder.close();

  if (audioEncoder) {
    audioEncoder.close();
  }

  if (videoEncoderError) throw videoEncoderError;
  if (audioEncoderError) throw audioEncoderError;

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
