import type { FaceLandmarker as FaceLandmarkerT } from "@mediapipe/tasks-vision";

// On-device challenge-response liveness (MediaPipe FaceLandmarker, runs in the
// browser — video never leaves the device). Issues random prompts and grades the
// QUALITY of the response (promptness, magnitude, monotonic approach, blink
// count), not just pass/fail — so sloppy or non-human responses lose points.

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export type ChallengeType = "turn" | "blink" | "closer";

export interface LivenessResult {
  ran: boolean;
  passed: boolean;
  challengesPassed: number;
  challengesTotal: number;
  multipleFaces: boolean;
  faceWasPresent: boolean;
  avgResponseMs: number | null;
  anomalies: string[]; // machine codes: e.g. "turn_no_response", "closer_erratic", "blink_abnormal"
  detail: string;
}

export function challengePrompt(t: ChallengeType): string {
  return t === "turn"
    ? "Slowly turn your head to one side, then back"
    : t === "blink"
      ? "Blink your eyes twice"
      : "Lean in closer to the camera";
}

function pickChallenges(n: number): ChallengeType[] {
  const all: ChallengeType[] = ["turn", "blink", "closer"];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return all.slice(0, n);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface LiveState { yaw: number; blinkCount: number; faceWidth: number; faceCount: number }

export async function runLivenessChallenge(
  video: HTMLVideoElement,
  setPrompt: (p: string | null) => void,
): Promise<LivenessResult> {
  const challenges = pickChallenges(2);
  const result: LivenessResult = {
    ran: false, passed: false, challengesPassed: 0, challengesTotal: challenges.length,
    multipleFaces: false, faceWasPresent: false, avgResponseMs: null, anomalies: [], detail: "",
  };

  let landmarker: FaceLandmarkerT | null = null;
  try {
    const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 2,
      outputFaceBlendshapes: true,
    });
  } catch (e) {
    result.detail = `On-device liveness model unavailable: ${(e as Error).message}`;
    setPrompt(null);
    return result;
  }

  result.ran = true;
  const state: LiveState = { yaw: 0.5, blinkCount: 0, faceWidth: 0, faceCount: 0 };
  let prevEyesClosed = false;
  let running = true;

  const tick = () => {
    if (!running || !landmarker) return;
    let res: ReturnType<FaceLandmarkerT["detectForVideo"]> | null = null;
    try { res = landmarker.detectForVideo(video, performance.now()); } catch { requestAnimationFrame(tick); return; }
    if (!res) { requestAnimationFrame(tick); return; }
    const faces = res.faceLandmarks ?? [];
    state.faceCount = faces.length;
    if (faces.length >= 2) result.multipleFaces = true;
    const lm = faces[0];
    if (lm) {
      result.faceWasPresent = true;
      const nose = lm[1], lc = lm[234], rc = lm[454];
      if (nose && lc && rc) state.yaw = (nose.x - lc.x) / ((rc.x - lc.x) || 1e-6);
      let minX = 1, maxX = 0;
      for (const p of lm) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; }
      state.faceWidth = maxX - minX;
      const bs = res.faceBlendshapes?.[0]?.categories ?? [];
      const get = (n: string) => bs.find((c) => c.categoryName === n)?.score ?? 0;
      const closed = get("eyeBlinkLeft") > 0.5 && get("eyeBlinkRight") > 0.5;
      if (closed && !prevEyesClosed) state.blinkCount++;
      prevEyesClosed = closed;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  await sleep(600); // settle / baseline
  const TIMEOUT = 9000;
  const respTimes: number[] = [];

  for (const ch of challenges) {
    setPrompt(challengePrompt(ch));
    const start = performance.now();
    const baseBlink = state.blinkCount;
    const baseWidth = state.faceWidth || 0.0001;
    const widths: number[] = [];
    let maxYawDev = 0;
    let dropouts = 0;
    let crossedMs = 0;

    while (performance.now() - start < TIMEOUT) {
      if (state.faceCount === 0) dropouts++;
      maxYawDev = Math.max(maxYawDev, Math.abs(state.yaw - 0.5));
      widths.push(state.faceWidth);
      const met =
        ch === "turn" ? Math.abs(state.yaw - 0.5) >= 0.17 :
        ch === "blink" ? state.blinkCount - baseBlink >= 2 :
        state.faceWidth >= baseWidth * 1.3;
      if (met) { crossedMs = performance.now() - start; break; }
      await sleep(110);
    }

    const passed = crossedMs > 0;
    respTimes.push(passed ? crossedMs : TIMEOUT);
    if (passed) result.challengesPassed++;

    // Quality deductions (each becomes a small risk add server-side).
    if (!passed) result.anomalies.push(`${ch}_no_response`);
    else if (crossedMs > 4000) result.anomalies.push(`${ch}_slow`); // didn't react promptly
    if (dropouts > 4) result.anomalies.push("face_dropout");
    if (ch === "blink" && passed) {
      const total = state.blinkCount - baseBlink;
      if (total < 2 || total > 5) result.anomalies.push("blink_abnormal"); // not ~twice, naturally
    }
    if (ch === "closer" && passed) {
      let drops = 0;
      for (let i = 1; i < widths.length; i++) if (widths[i]! < widths[i - 1]! - 0.01) drops++;
      if (drops > Math.max(2, widths.length * 0.25)) result.anomalies.push("closer_erratic"); // not monotonic
    }
    if (ch === "turn" && passed && maxYawDev < 0.22) result.anomalies.push("turn_weak");

    setPrompt(passed ? "✓ Got it" : "Didn't catch that");
    await sleep(700);
  }

  running = false;
  try { landmarker.close(); } catch { /* ignore */ }
  setPrompt(null);

  result.avgResponseMs = respTimes.length ? Math.round(respTimes.reduce((a, b) => a + b, 0) / respTimes.length) : null;
  result.passed = result.challengesPassed === challenges.length && result.faceWasPresent && !result.multipleFaces;
  result.detail = !result.faceWasPresent
    ? "No live face detected during the challenge."
    : result.multipleFaces
      ? "More than one face was detected during the check."
      : result.passed
        ? `Passed all ${result.challengesTotal} live challenges (${result.anomalies.length} quality flag(s)).`
        : `Only ${result.challengesPassed}/${result.challengesTotal} live challenges completed.`;
  return result;
}
