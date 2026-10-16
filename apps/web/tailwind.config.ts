import type { Config } from "tailwindcss";

const neutralPalette = {
  50: "rgb(var(--research-canvas-rgb) / <alpha-value>)",
  100: "rgb(var(--research-canvas-rgb) / <alpha-value>)",
  200: "rgb(var(--research-border-rgb) / <alpha-value>)",
  300: "rgb(var(--research-border-rgb) / <alpha-value>)",
  400: "rgb(var(--research-muted-rgb) / <alpha-value>)",
  500: "rgb(var(--research-muted-rgb) / <alpha-value>)",
  600: "rgb(var(--research-muted-rgb) / <alpha-value>)",
  700: "rgb(var(--research-ink-rgb) / <alpha-value>)",
  800: "rgb(var(--research-ink-rgb) / <alpha-value>)",
  900: "rgb(var(--research-ink-rgb) / <alpha-value>)",
  950: "rgb(var(--research-ink-rgb) / <alpha-value>)"
};

const accentPalette = (accent: "primary" | "comparison") => Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map(shade => [shade,
    `rgb(var(--research-${shade <= 100 ? "success" : shade <= 300 ? "selected-border" : accent}-rgb) / <alpha-value>)`])
);

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontSize: {
        xs: ["var(--research-caption-size)", "1.5"], sm: ["var(--research-body-size)", "1.5"],
        base: ["var(--research-card-title-size)", "1.5"], lg: ["var(--research-section-title-size)", "1.35"],
        xl: ["var(--research-section-title-size)", "1.35"], "2xl": ["var(--research-section-title-size)", "1.35"],
        "3xl": ["var(--research-section-title-size)", "1.35"], "4xl": ["var(--research-section-title-size)", "1.35"],
        "5xl": ["var(--research-section-title-size)", "1.35"], "6xl": ["var(--research-section-title-size)", "1.35"]
      },
      borderRadius: { sm: "var(--research-control-radius)", md: "var(--research-control-radius)", lg: "var(--research-card-radius)", xl: "var(--research-card-radius)" },
      colors: {
        slate: neutralPalette, gray: neutralPalette, zinc: neutralPalette, neutral: neutralPalette, stone: neutralPalette,
        blue: accentPalette("primary"), sky: accentPalette("primary"), cyan: accentPalette("primary"),
        green: accentPalette("primary"), emerald: accentPalette("primary"), indigo: accentPalette("primary"),
        red: accentPalette("comparison"), rose: accentPalette("comparison"), yellow: accentPalette("comparison"), orange: accentPalette("comparison"),
        ink: "rgb(var(--research-ink-rgb) / <alpha-value>)",
        muted: "rgb(var(--research-muted-rgb) / <alpha-value>)",
        line: "rgb(var(--research-border-rgb) / <alpha-value>)",
        panel: "#ffffff",
        canvas: "rgb(var(--research-canvas-rgb) / <alpha-value>)",
        teal: {
          50: "rgb(var(--research-success-rgb) / <alpha-value>)",
          100: "rgb(var(--research-selected-border-rgb) / <alpha-value>)",
          600: "rgb(var(--research-primary-rgb) / <alpha-value>)",
          700: "rgb(var(--research-primary-rgb) / <alpha-value>)",
          800: "rgb(var(--research-primary-hover-rgb) / <alpha-value>)",
          900: "rgb(var(--research-primary-hover-rgb) / <alpha-value>)"
        },
        amber: {
          100: "rgb(var(--research-success-rgb) / <alpha-value>)",
          500: "rgb(var(--research-comparison-rgb) / <alpha-value>)",
          600: "rgb(var(--research-comparison-rgb) / <alpha-value>)"
        }
      },
      boxShadow: {
        panel: "0 10px 30px rgba(21, 37, 40, 0.06)"
      }
    }
  },
  plugins: []
} satisfies Config;
