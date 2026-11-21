import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        terminal: {
          canvas: "var(--terminal-canvas)",
          card: "var(--terminal-card)",
          panel: "var(--terminal-panel)",
          elevated: "var(--terminal-elevated)",
          border: "var(--terminal-border)",
          borderSubtle: "var(--terminal-border-subtle)",
          textPrimary: "var(--terminal-text-primary)",
          textSecondary: "var(--terminal-text-secondary)",
          textMuted: "var(--terminal-text-muted)",
          emerald: "var(--terminal-emerald)",
          amber: "var(--terminal-amber)",
          red: "var(--terminal-red)",
          cyan: "var(--terminal-cyan)",
        },
        salmo: {
          dark: {
            bg: "#070B14",
            surface: "#0F1624",
            elevated: "#161F30",
            border: "#1E293B",
            borderSubtle: "#141D2C",
            textPrimary: "#F8FAFC",
            textSecondary: "#94A3B8",
            textTertiary: "#64748B",
          },
          light: {
            bg: "#F8FAFC",
            surface: "#FFFFFF",
            elevated: "#F1F5F9",
            border: "#CBD5E1",
            textPrimary: "#0F172A",
            textSecondary: "#475569",
            textTertiary: "#94A3B8",
          },
          status: {
            green: "#10B981",
            greenTextDark: "#10B981",
            greenTextLight: "#059669",
            yellow: "#F59E0B",
            yellowTextDark: "#F59E0B",
            yellowTextLight: "#D97706",
            red: "#EF4444",
            redTextDark: "#EF4444",
            redTextLight: "#DC2626",
            grey: "#64748B",
            greyTextDark: "#94A3B8",
            greyTextLight: "#64748B",
          }
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "Monaco", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
