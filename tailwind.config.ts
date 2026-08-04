import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        midnight: "#0B0F14",
        graphite: "#1E242C",
        charcoal: "#111820",
        navyblack: "#08111C",
        ivory: "#F8F8F6",
        stone: "#E8E4DA",
        gold: {
          DEFAULT: "#C6A55A",
          soft: "#D4B872",
          deep: "#A8863F",
        },
        copper: "#B86A32",
        emerald: "#0F6B5C",
        ink: "#101418",
        muted: "#5C6470",
        mutedlight: "#D6D8DA",
      },
      fontFamily: {
        display: ["var(--font-playfair)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      maxWidth: {
        content: "1200px",
        prose: "72ch",
      },
      letterSpacing: {
        tightest: "-0.04em",
        widelabel: "0.18em",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.22,1,0.36,1) forwards",
      },
    },
  },
  plugins: [],
};

export default config;
