import type { Config } from "tailwindcss";

// デザイントークンは docs/design/design-system.md §7 を正典とする。
// "AIっぽさ"を排した温かく編集的な世界観（生成り地 + テラコッタ1アクセント）。
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { base: "#FBF7F0", surface: "#FFFFFF", sunken: "#F2ECE2" },
        ink: { 900: "#2B2622", 700: "#4A433C", 500: "#7A7066", 300: "#B8AE9F" },
        line: { 200: "#E5DCCD", 100: "#EFE8DC" },
        accent: { 600: "#A85638", 500: "#C2703D", 300: "#E7B79A", 100: "#F6E7DC" },
        secondary: { 500: "#5E7A57", 100: "#E7EDE6" },
        state: {
          info: "#5B7186",
          success: "#5E7A57",
          warn: "#C08A2E",
          muted: "#9A9082",
          danger: "#B0463C",
        },
        trust: { 600: "#8A6D3B", 300: "#D8C39A", 100: "#F3EAD8" },
        verified: { 500: "#5E7A57" },
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', '"Hiragino Sans"', "system-ui", "sans-serif"],
        serif: ['"Shippori Mincho"', '"Noto Serif JP"', "serif"],
      },
      borderRadius: { sm: "6px", md: "10px", lg: "14px" },
      boxShadow: {
        sm: "0 1px 2px rgba(43,38,34,0.06)",
        md: "0 6px 20px rgba(43,38,34,0.10)",
      },
      maxWidth: { app: "480px" }, // スマホ縦 LIFF の最大幅
    },
  },
  plugins: [],
};

export default config;
