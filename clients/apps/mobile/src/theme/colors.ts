/**
 * Color system matching Aarogya Ruchi web app
 * Based on hsl values from globals.css
 */
export const colors = {
  // Primary colors
  background: "#FFFFFF",
  foreground: "#211509", // Dark brown (hsl(30 57% 8%))
  card: "#F6EDE4", // Warm beige (hsl(30 47% 93%))
  primary: "#429D49", // Health green (hsl(125 41% 44%))
  border: "#211509", // Dark brown border

  // Theme colors
  cream: "#E3F2E8", // Light green tint (hsl(140 60% 90%))
  cta: "#E89766", // Warm peach (hsl(20 90% 65%))
  ctaForeground: "#211509",
  lime: "#E1F532", // Energy/Popular (hsl(66 91% 58%))
  purple: "#5541BA", // Secondary (hsl(250 49% 49%))
  coral: "#EA657A", // Highlights (hsl(350 77% 66%))

  // Muted colors
  muted: "#F6EDE4", // Same as card
  mutedForeground: "#A38F83", // Secondary text (hsl(30 15% 58%))

  // Semantic colors
  destructive: "#EA657A",
  destructiveForeground: "#FFFFFF",
  input: "#A38F83",
  ring: "#429D49",
} as const

export type Color = typeof colors
