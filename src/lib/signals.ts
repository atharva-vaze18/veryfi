import type { ClientSignals } from "./score";

// All REAL measurements taken in the candidate's browser. No permission needed
// for the passive set; the camera set requires the candidate to grant access.

export async function collectPassiveSignals(): Promise<ClientSignals> {
  const nav = navigator as Navigator & { deviceMemory?: number; webdriver?: boolean };
  let minLatency = Infinity;
  for (let i = 0; i < 4; i++) {
    const t0 = performance.now();
    try {
      await fetch("/api/health", { cache: "no-store" });
      minLatency = Math.min(minLatency, performance.now() - t0);
    } catch {
      /* ignore */
    }
  }
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffsetMin: -new Date().getTimezoneOffset(),
    minLatencyMs: Number.isFinite(minLatency) ? Math.round(minLatency) : undefined,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    userAgent: nav.userAgent,
    webdriver: nav.webdriver === true,
    screen: { w: window.screen.width, h: window.screen.height },
  };
}

export interface CameraSignals {
  cameraLabels: string[];
  virtualCameraLabels: string[];
  livenessRan: boolean;
  livenessMotion: boolean;
  faceImage?: string; // captured JPEG data-URL, sent for deepfake analysis (transient)
  error?: string;
}

const VCAM = /obs|virtual|manycam|snap\s*camera|xsplit|droidcam|epoccam|e2esoft|vcam|fake|avatarify|nvidia broadcast/i;

// Requests the camera, enumerates devices (labels become available once granted),
// flags virtual cameras, and runs a static-photo (motion) liveness check.
export async function collectCameraSignals(): Promise<CameraSignals> {
  const out: CameraSignals = { cameraLabels: [], virtualCameraLabels: [], livenessRan: false, livenessMotion: false };
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
    const devices = await navigator.mediaDevices.enumerateDevices();
    out.cameraLabels = devices.filter((d) => d.kind === "videoinput").map((d) => d.label).filter(Boolean);
    out.virtualCameraLabels = out.cameraLabels.filter((l) => VCAM.test(l));

    out.livenessMotion = await measureMotion(stream);
    out.livenessRan = true;
    // Capture a single still frame for deepfake-content analysis (Reality Defender).
    out.faceImage = await captureFrame(stream);
  } catch (e) {
    out.error = (e as Error).message;
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
  }
  return out;
}

// Captures a single still JPEG frame from the live stream (downscaled, ~640px)
// for deepfake-content analysis. Returns a data-URL.
function captureFrame(stream: MediaStream): Promise<string | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    const grab = () => {
      try {
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 480;
        const scale = Math.min(1, 640 / w);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(undefined);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch {
        resolve(undefined);
      }
    };
    video.play().then(() => setTimeout(grab, 300)).catch(() => resolve(undefined));
  });
}

// Samples ~12 frames over ~1.8s and returns true if the feed shows natural motion
// (a live person) vs a static image held to the camera.
function measureMotion(stream: MediaStream): Promise<boolean> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return resolve(false);

    let prev: Uint8ClampedArray | null = null;
    let diffSum = 0;
    let samples = 0;

    const sample = () => {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const cur = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        if (prev) {
          let d = 0;
          for (let i = 0; i < cur.length; i += 4) d += Math.abs(cur[i]! - prev[i]!);
          diffSum += d / (cur.length / 4); // mean abs diff on the red channel
          samples++;
        }
        prev = cur.slice();
      } catch {
        /* ignore a frame */
      }
    };

    video.play().then(() => {
      const interval = setInterval(sample, 150);
      setTimeout(() => {
        clearInterval(interval);
        const avg = samples ? diffSum / samples : 0;
        resolve(avg > 2.2); // threshold: live motion vs static photo
      }, 1900);
    }).catch(() => resolve(false));
  });
}
