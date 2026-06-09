// Passive behavioral signal collection during the candidate flow.
// Collects ONLY timing and interaction patterns — no keystrokes or characters are
// ever recorded. All data is metadata used to detect bot-assisted or coached sessions.

import type { BehavioralSignals } from "./score";

interface CollectorState {
  startTime: number;
  consentStartTime: number;
  cameraStartTime: number | null;
  focusBlurCount: number;
  pasteName: boolean;
  keystrokeCount: number;
  lastKeystrokeTime: number | null;
  pointerSamples: Array<{ x: number; y: number }>;
  scrollEventCount: number;
  totalScrollDistance: number;
  lastScrollY: number;
  isTouchDevice: boolean;
  // Cleanup references
  cleanupFns: Array<() => void>;
}

export function startCollecting(): () => BehavioralSignals {
  const state: CollectorState = {
    startTime: performance.now(),
    consentStartTime: performance.now(),
    cameraStartTime: null,
    focusBlurCount: 0,
    pasteName: false,
    keystrokeCount: 0,
    lastKeystrokeTime: null,
    pointerSamples: [],
    scrollEventCount: 0,
    totalScrollDistance: 0,
    lastScrollY: window.scrollY,
    isTouchDevice: window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0,
    cleanupFns: [],
  };

  // Focus/blur — detects tab switching (coaching risk).
  const onFocus = () => state.focusBlurCount++;
  const onBlur = () => state.focusBlurCount++;
  window.addEventListener("focus", onFocus);
  window.addEventListener("blur", onBlur);
  state.cleanupFns.push(() => { window.removeEventListener("focus", onFocus); window.removeEventListener("blur", onBlur); });

  // Paste detection on any input.
  const onPaste = (e: ClipboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") state.pasteName = true;
  };
  document.addEventListener("paste", onPaste);
  state.cleanupFns.push(() => document.removeEventListener("paste", onPaste));

  // Keystroke count (inter-key timing — not the characters).
  const onKeydown = () => {
    state.keystrokeCount++;
    state.lastKeystrokeTime = performance.now();
  };
  document.addEventListener("keydown", onKeydown);
  state.cleanupFns.push(() => document.removeEventListener("keydown", onKeydown));

  // Pointer position sampling at 100ms intervals.
  let lastPointer = { x: 0, y: 0 };
  const onPointer = (e: PointerEvent) => { lastPointer = { x: e.clientX, y: e.clientY }; };
  document.addEventListener("pointermove", onPointer, { passive: true });
  state.cleanupFns.push(() => document.removeEventListener("pointermove", onPointer));

  const sampleInterval = setInterval(() => {
    state.pointerSamples.push({ ...lastPointer });
    if (state.pointerSamples.length > 500) state.pointerSamples.shift();
  }, 100);
  state.cleanupFns.push(() => clearInterval(sampleInterval));

  // Scroll behavior.
  const onScroll = () => {
    const delta = Math.abs(window.scrollY - state.lastScrollY);
    state.totalScrollDistance += delta;
    state.lastScrollY = window.scrollY;
    state.scrollEventCount++;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  state.cleanupFns.push(() => window.removeEventListener("scroll", onScroll));

  // stopAndGetSignals: call just before the submit POST.
  return function stopAndGetSignals(): BehavioralSignals {
    state.cleanupFns.forEach((fn) => fn());

    // Compute mouse path length and direction-change count.
    let mousePathLength = 0;
    let mouseDirectionChanges = 0;
    const samples = state.pointerSamples;
    let lastDx = 0, lastDy = 0;
    for (let i = 1; i < samples.length; i++) {
      const dx = samples[i]!.x - samples[i - 1]!.x;
      const dy = samples[i]!.y - samples[i - 1]!.y;
      mousePathLength += Math.sqrt(dx * dx + dy * dy);
      if (i > 1 && (Math.sign(dx) !== Math.sign(lastDx) || Math.sign(dy) !== Math.sign(lastDy))) {
        mouseDirectionChanges++;
      }
      lastDx = dx; lastDy = dy;
    }

    const totalElapsed = performance.now() - state.consentStartTime;
    const timeOnConsentMs = state.cameraStartTime != null
      ? state.cameraStartTime - state.consentStartTime
      : totalElapsed;
    const timeOnCameraMs = state.cameraStartTime != null
      ? performance.now() - state.cameraStartTime
      : 0;

    return {
      pasteName: state.pasteName,
      focusBlurCount: state.focusBlurCount,
      timeOnConsentMs: Math.round(timeOnConsentMs),
      timeOnCameraMs: Math.round(timeOnCameraMs),
      mousePathLength: Math.round(mousePathLength),
      mouseDirectionChanges,
      scrollEventCount: state.scrollEventCount,
      totalScrollDistance: Math.round(state.totalScrollDistance),
      keystrokeCount: state.keystrokeCount,
      isTouchDevice: state.isTouchDevice,
    };
  };
}

// Call this when the candidate transitions to the camera step.
export function markCameraStepStart(stopFn: ReturnType<typeof startCollecting>): void {
  // Access internal state through a side-channel approach: we re-use the function
  // closure. Instead we expose a simple timestamp tracker on the window.
  (window as Window & { _veryfiCameraStart?: number })._veryfiCameraStart = performance.now();
}
