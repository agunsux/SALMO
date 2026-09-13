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
        salmo: {
          dark: {
            bg: "#0B0D10",
            surface: "#111418",
            elevated: "#171B20",
            border: "#232830",
            borderSubtle: "#1C2026",
            textPrimary: "#E6E9EE",
            textSecondary: "#8A93A0",
            textTertiary: "#5B6370",
          },
          light: {
            bg: "#F6F7F9",
            surface: "#FFFFFF",
            elevated: "#EFF1F5",
            border: "#DCE0E7",
            textPrimary: "#14171C",
            textSecondary: "#5A6270",
            textTertiary: "#8A93A0",
          },
          status: {
            green: "#22C55E",
            greenTextDark: "#4ADE80",
            greenTextLight: "#16A34A",
            yellow: "#EAB308",
            yellowTextDark: "#FACC15",
            yellowTextLight: "#CA8A04",
            red: "#EF4444",
            redTextDark: "#F87171",
            redTextLight: "#DC2626",
            grey: "#71717A",
            greyTextDark: "#A1A1AA",
            greyTextLight: "#52525B",
          }
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
