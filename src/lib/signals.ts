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
  error?: string;
}

const VCAM = /obs|virtual|manycam|snap\s*camera|xsplit|droidcam|epoccam|e2esoft|vcam|fake|avatarify|nvidia broadcast/i;

// Requests the camera, enumerates devices (labels become available once granted),
// flags virtual cameras, and runs a static-photo (motion) liveness check.
export async function collectCameraSignals(): Promise<CameraSignals> {
  const out: CameraSignals = { cameraLabels: [], virtualCameraLabels: [], livenessRan: false, livenessMotion: false };
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
    const devices = await navigator.mediaDevices.enumerateDevices();
    out.cameraLabels = devices.filter((d) => d.kind === "videoinput").map((d) => d.label).filter(Boolean);
    out.virtualCameraLabels = out.cameraLabels.filter((l) => VCAM.test(l));

    out.livenessMotion = await measureMotion(stream);
    out.livenessRan = true;
  } catch (e) {
    out.error = (e as Error).message;
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
  }
  return out;
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
