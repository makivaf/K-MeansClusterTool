import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--research-ink)",
        muted: "var(--research-muted)",
        line: "var(--research-border)",
        panel: "#ffffff",
        canvas: "var(--research-canvas)",
        teal: {
          50: "#e8f6f5",
          100: "#c9ebe8",
          600: "var(--research-primary)",
          700: "var(--research-primary)",
          800: "var(--research-primary-hover)",
          900: "#083c3d"
        },
        amber: {
          100: "#fbedd3",
          500: "#d88a00",
          600: "#b97000"
        }
      },
      boxShadow: {
        panel: "0 10px 30px rgba(21, 37, 40, 0.06)"
      }
    }
  },
  plugins: []
} satisfies Config;
