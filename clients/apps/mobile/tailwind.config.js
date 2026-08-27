/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#FFFFFF",
        foreground: "#211509",
        card: "#F6EDE4",
        "card-foreground": "#211509",
        popover: "#FFFFFF",
        "popover-foreground": "#211509",
        primary: {
          DEFAULT: "#429D49",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#F6EDE4",
          foreground: "#211509",
        },
        muted: {
          DEFAULT: "#F6EDE4",
          foreground: "#A38F83",
        },
        accent: {
          DEFAULT: "#F6EDE4",
          foreground: "#211509",
        },
        destructive: {
          DEFAULT: "#EA657A",
          foreground: "#FFFFFF",
        },
        border: "#211509",
        input: "#A38F83",
        ring: "#429D49",

        // Theme colors
        cream: "#E3F2E8",
        cta: {
          DEFAULT: "#E89766",
          foreground: "#211509",
        },
        lime: {
          DEFAULT: "#E1F532",
          foreground: "#211509",
        },
        purple: {
          DEFAULT: "#5541BA",
          foreground: "#FFFFFF",
        },
        coral: "#EA657A",
      },
      borderRadius: {
        sm: 4,
        md: 14,
        lg: 16,
        xl: 20,
        full: 9999,
      },
      spacing: {
        xs: 4,
        sm: 8,
        md: 12,
        lg: 16,
        xl: 24,
        xxl: 32,
        xxxl: 48,
        xxxxl: 64,
        xxxxxl: 96,
        xxxxxxl: 128,
      },
    },
  },
  plugins: [],
};
