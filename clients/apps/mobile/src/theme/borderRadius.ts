/**
 * Border radius values matching web app
 * Based on CSS custom properties
 */
export const radius = {
  sm: 4, // 0.25rem
  md: 14, // var(--radius) - 2px
  lg: 16, // var(--radius)
  xl: 20, // var(--radius) + 4px
  full: 9999,
} as const

export type Radius = typeof radius
