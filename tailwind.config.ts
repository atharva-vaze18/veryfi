import type { Config } from "tailwindcss";

// Orbyt brand — deep near-black navy + electric-blue "orbit" glow.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: "#070b16", 2: "#0d1426", 3: "#162038" },
        ink: { DEFAULT: "#eaf0ff", 2: "#c4cfe6", 3: "#9aa7c4" },
        rule: "#222d49",
        accent: { DEFAULT: "#4d8dff", 2: "#6ea3ff" },
        pass: "#3ddc97",
        review: "#f3b34d",
        risk: "#ff6f6b",
        muted: "#8492b0",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "Menlo", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 rgba(120,150,255,0.04), 0 8px 24px rgba(2,6,16,0.5)",
        glow: "0 0 24px rgba(77,141,255,0.35)",
      },
      keyframes: {
        "fade-up": { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        "bar-grow": { "0%": { transform: "scaleX(0)" }, "100%": { transform: "scaleX(1)" } },
        "orbit-glow": {
          "0%,100%": { opacity: "0.75", filter: "drop-shadow(0 0 6px rgba(77,141,255,0.55))" },
          "50%": { opacity: "1", filter: "drop-shadow(0 0 14px rgba(77,141,255,0.9))" },
        },
        spin: { to: { transform: "rotate(360deg)" } },
        // Landing/dashboard redesign — all motion is transform/opacity only (GPU-friendly).
        "orbit-sweep": { to: { transform: "rotate(360deg)" } },
        "node-pulse": {
          "0%,100%": { transform: "translate(-50%,-50%) scale(1)", opacity: "0.8" },
          "50%": { transform: "translate(-50%,-50%) scale(1.32)", opacity: "1" },
        },
        ripple: {
          "0%": { transform: "translate(-50%,-50%) scale(0.25)", opacity: "0.55" },
          "100%": { transform: "translate(-50%,-50%) scale(1.05)", opacity: "0" },
        },
        "orb-wander": {
          "0%": { transform: "translate(0px,0px)" },
          "14%": { transform: "translate(15px,-11px)" },
          "30%": { transform: "translate(-9px,-17px)" },
          "46%": { transform: "translate(-19px,5px)" },
          "62%": { transform: "translate(7px,16px)" },
          "80%": { transform: "translate(17px,-3px)" },
          "100%": { transform: "translate(0px,0px)" },
        },
        "dot-look": {
          "0%,10%": { transform: "rotate(0deg)" },
          "16%,26%": { transform: "rotate(155deg)" },
          "32%,42%": { transform: "rotate(-110deg)" },
          "48%,58%": { transform: "rotate(70deg)" },
          "64%,74%": { transform: "rotate(-160deg)" },
          "80%,90%": { transform: "rotate(40deg)" },
          "100%": { transform: "rotate(0deg)" },
        },
        blink: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.3" } },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease-out both",
        "bar-grow": "bar-grow 0.7s cubic-bezier(0.2,0.8,0.2,1) both",
        "orbit-glow": "orbit-glow 4s ease-in-out infinite",
        spin: "spin 1s linear infinite",
        "orbit-sweep": "orbit-sweep 6.5s linear infinite",
        "node-pulse": "node-pulse 2.6s ease-in-out infinite",
        ripple: "ripple 3.2s ease-out infinite",
        "orb-wander": "orb-wander 11s ease-in-out infinite",
        "dot-look": "dot-look 9s ease-in-out infinite",
        blink: "blink 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
