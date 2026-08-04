import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Core neutrals — deep space, not luxury black
        space: "#070B18",       // near-black deep space blue
        abyss: "#0A1024",       // primary background
        void: "#0D1530",        // elevated surface
        slate2: "#141C3A",      // cards
        ice: "#EEF2FF",         // primary text (ice white)
        fog: "#AEB8D8",         // secondary text
        dust: "#6B77A0",        // muted text

        // Education ecosystem — cosmic
        cyan: { DEFAULT: "#3DE1F0", soft: "#7CEDF7", deep: "#1BA9BC" },
        indigo2: "#5B6CF0",
        violet2: "#8B5CF6",
        ultraviolet: "#A78BFA",

        // Enterprise ecosystem
        emerald2: { DEFAULT: "#12D48C", deep: "#0A9E68" },
        signal: "#FF7A2F",      // signal orange
        steel: "#8895B8",

        // Technology ecosystem
        magenta: { DEFAULT: "#F03Dce", soft: "#F877DA" },
        lime2: "#B6FF3D",
        silver: "#C7D0E8",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      maxWidth: {
        content: "1240px",
        prose: "70ch",
      },
      letterSpacing: {
        tightest: "-0.03em",
        widelabel: "0.2em",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(to right, rgba(120,140,220,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(120,140,220,0.06) 1px, transparent 1px)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        orbit: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "pulse-soft": {
          "0%,100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        drift: {
          "0%": { transform: "translate(0,0)" },
          "100%": { transform: "translate(-40px,-30px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.8s cubic-bezier(0.22,1,0.36,1) forwards",
        float: "float 6s ease-in-out infinite",
        "orbit-slow": "orbit 40s linear infinite",
        "orbit-med": "orbit 26s linear infinite",
        "pulse-soft": "pulse-soft 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
