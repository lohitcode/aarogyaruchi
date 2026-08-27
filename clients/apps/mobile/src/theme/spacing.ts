/**
 * Spacing scale matching web app
 * Based on rem units converted to pixels (1rem = 16px)
 */
export const spacing = {
  xs: 4, // 0.25rem
  sm: 8, // 0.5rem
  md: 12, // 0.75rem
  lg: 16, // 1rem (base unit)
  xl: 24, // 1.5rem
  xxl: 32, // 2rem
  xxxl: 48, // 3rem
  xxxxl: 64, // 4rem
  xxxxxl: 96, // 6rem
  xxxxxxl: 128, // 8rem
} as const

export type Spacing = typeof spacing
