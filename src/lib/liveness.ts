import type { FaceLandmarker as FaceLandmarkerT } from "@mediapipe/tasks-vision";

// On-device challenge-response liveness. Runs Google MediaPipe FaceLandmarker
// entirely in the browser (WASM) — the video never leaves the candidate's
// machine. Issues random prompts (turn / blink / lean in) and verifies the live
// action actually happened. This is what defeats static photos and most
// real-time deepfakes (they can't respond to a random, timed prompt) — and being
// on-device, it adds no new data-handling/legal exposure.

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
  challenges: Array<{ type: ChallengeType; passed: boolean }>;
  detail: string;
}

export function challengePrompt(t: ChallengeType): string {
  return t === "turn"
    ? "Slowly turn your head to one side, then back"
    : t === "blink"
      ? "Blink your eyes twice"
      : "Lean in a little closer to the camera";
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

export async function runLivenessChallenge(
  video: HTMLVideoElement,
  setPrompt: (p: string | null) => void,
): Promise<LivenessResult> {
  const challenges = pickChallenges(2);
  const result: LivenessResult = {
    ran: false, passed: false, challengesPassed: 0, challengesTotal: challenges.length,
    multipleFaces: false, faceWasPresent: false, challenges: [], detail: "",
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
    // Graceful: model couldn't load -> liveness "not evaluated", never a hard fail.
    result.detail = `On-device liveness model unavailable: ${(e as Error).message}`;
    setPrompt(null);
    return result;
  }

  result.ran = true;

  const state = { yaw: 0.5, blinkCount: 0, faceCount: 0, faceWidth: 0 };
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
      if (nose && lc && rc) {
        const denom = (rc.x - lc.x) || 1e-6;
        state.yaw = (nose.x - lc.x) / denom; // ~0.5 forward; far from 0.5 = turned
      }
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

  const waitFor = async (cond: () => boolean, timeoutMs: number) => {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      if (cond()) return true;
      await sleep(120);
    }
    return false;
  };

  // settle so we have a baseline before the first prompt
  await sleep(600);
  for (const ch of challenges) {
    setPrompt(challengePrompt(ch));
    const baseBlink = state.blinkCount;
    const baseWidth = state.faceWidth || 0.0001;
    let cond: () => boolean;
    if (ch === "turn") cond = () => state.yaw < 0.38 || state.yaw > 0.62;
    else if (ch === "blink") cond = () => state.blinkCount - baseBlink >= 2;
    else cond = () => state.faceWidth > baseWidth * 1.22;
    const ok = await waitFor(cond, 9000);
    result.challenges.push({ type: ch, passed: ok });
    if (ok) result.challengesPassed++;
    setPrompt(ok ? "✓ Got it" : "Didn't catch that — moving on");
    await sleep(700);
  }

  running = false;
  try { landmarker.close(); } catch { /* ignore */ }
  setPrompt(null);

  result.passed = result.challengesPassed === challenges.length && result.faceWasPresent && !result.multipleFaces;
  result.detail = !result.faceWasPresent
    ? "No live face detected during the challenge."
    : result.multipleFaces
      ? "More than one face was detected during the check."
      : result.passed
        ? `Passed all ${result.challengesTotal} live challenges with a single face present.`
        : `Only ${result.challengesPassed}/${result.challengesTotal} live challenges completed.`;
  return result;
}
