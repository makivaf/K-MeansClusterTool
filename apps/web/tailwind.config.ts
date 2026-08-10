import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#152528",
        muted: "#657579",
        line: "#dbe4e4",
        panel: "#ffffff",
        canvas: "#f6f9f9",
        teal: {
          50: "#e8f6f5",
          100: "#c9ebe8",
          600: "#0f7977",
          700: "#0b6665",
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
