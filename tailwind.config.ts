import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F3F1EB",
        paper: "#FFFcf7",
        ink: {
          DEFAULT: "#161513",
          soft: "#3F3D38",
          mute: "#6F6C64",
        },
        brand: {
          50: "#E8F0EC",
          100: "#D2E2DA",
          200: "#A8C5B6",
          400: "#3E8A6F",
          500: "#1F6B54",
          600: "#1B4D3E",
          700: "#163E32",
          900: "#0C241C",
        },
        sand: "#F3F1EB",
        line: "rgba(22,21,19,0.08)",
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "IBM Plex Sans",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        display: [
          "var(--font-display)",
          "Newsreader",
          "ui-serif",
          "Georgia",
          "serif",
        ],
        mono: [
          "IBM Plex Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      boxShadow: {
        card: "0 0 0 1px rgba(22,21,19,0.06), 0 1px 2px rgba(22,21,19,0.04), 0 12px 32px -16px rgba(22,21,19,0.12)",
        lift: "0 0 0 1px rgba(22,21,19,0.08), 0 8px 24px -12px rgba(22,21,19,0.18)",
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
    },
  },
  plugins: [],
};

export default config;
