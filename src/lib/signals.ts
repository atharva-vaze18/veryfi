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

// Requests the camera, enumerates devices, flags virtual cameras, runs the
// static-photo (motion) liveness check, and captures a frame for deepfake
// analysis. If a preview <video> element is passed, the live feed is shown in it
// so the candidate can see what's being captured.
export async function collectCameraSignals(previewEl?: HTMLVideoElement | null): Promise<CameraSignals> {
  const out: CameraSignals = { cameraLabels: [], virtualCameraLabels: [], livenessRan: false, livenessMotion: false };
  let stream: MediaStream | null = null;
  let hiddenVideo: HTMLVideoElement | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
    const video = previewEl ?? (hiddenVideo = document.createElement("video"));
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play().catch(() => {});
    await waitForFrame(video);

    const devices = await navigator.mediaDevices.enumerateDevices();
    out.cameraLabels = devices.filter((d) => d.kind === "videoinput").map((d) => d.label).filter(Boolean);
    out.virtualCameraLabels = out.cameraLabels.filter((l) => VCAM.test(l));

    out.livenessMotion = await measureMotion(video); // ~1.9s of live preview
    out.livenessRan = true;
    out.faceImage = captureFrame(video); // single still frame for Reality Defender
  } catch (e) {
    out.error = (e as Error).message;
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
    if (previewEl) try { previewEl.srcObject = null; } catch { /* ignore */ }
    if (hiddenVideo) hiddenVideo.srcObject = null;
  }
  return out;
}

function waitForFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= 2 && video.videoWidth > 0) return resolve();
    const t = setTimeout(resolve, 1500);
    video.addEventListener("loadeddata", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

// Single still JPEG frame (downscaled ~640px) from the live video, for deepfake analysis.
function captureFrame(video: HTMLVideoElement): string | undefined {
  try {
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    const scale = Math.min(1, 640 / w);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return undefined;
  }
}

// Samples frames over ~1.8s; true if the feed shows natural motion (a live person)
// vs a static image held to the camera.
function measureMotion(video: HTMLVideoElement): Promise<boolean> {
  return new Promise((resolve) => {
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
          diffSum += d / (cur.length / 4);
          samples++;
        }
        prev = cur.slice();
      } catch {
        /* ignore a frame */
      }
    };
    const interval = setInterval(sample, 150);
    setTimeout(() => {
      clearInterval(interval);
      resolve((samples ? diffSum / samples : 0) > 2.2);
    }, 1900);
  });
}
