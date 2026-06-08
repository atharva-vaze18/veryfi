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
      },
      animation: {
        "fade-up": "fade-up 0.4s ease-out both",
        "bar-grow": "bar-grow 0.7s cubic-bezier(0.2,0.8,0.2,1) both",
        "orbit-glow": "orbit-glow 4s ease-in-out infinite",
        spin: "spin 1s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
