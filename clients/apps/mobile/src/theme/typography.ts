/**
 * Typography system matching web app
 * Uses Bricolage Grotesque, Inter, and Londrina Solid fonts
 */
export const fonts = {
  // Font families
  display: "BricolageGrotesque",
  body: "Inter",
  accent: "LondrinaSolid",
} as const

/**
 * Text styles matching web app
 * All sizes in pixels
 */
export const textStyle = {
  // Display/hero text
  hero: {
    fontSize: 64,
    lineHeight: 72,
    fontWeight: "700" as const,
    fontFamily: fonts.display,
  },
  heroLarge: {
    fontSize: 112,
    lineHeight: 120,
    fontWeight: "700" as const,
    fontFamily: fonts.display,
  },

  // Headings
  h1: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: "700" as const,
    fontFamily: fonts.display,
  },
  h2: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: "600" as const,
    fontFamily: fonts.display,
  },
  h3: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600" as const,
    fontFamily: fonts.display,
  },
  h4: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600" as const,
    fontFamily: fonts.display,
  },

  // Body text
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
    fontFamily: fonts.body,
  },
  bodyLarge: {
    fontSize: 18,
    lineHeight: 28,
    fontWeight: "400" as const,
    fontFamily: fonts.body,
  },
  bodySmall: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
    fontFamily: fonts.body,
  },

  // Small text
  small: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400" as const,
    fontFamily: fonts.body,
  },
  tiny: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "400" as const,
    fontFamily: fonts.body,
  },

  // Accent text (Londrina Solid)
  accent: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "400" as const,
    fontFamily: fonts.accent,
  },
} as const

/**
 * Font weights
 */
export const fontWeight = {
  light: "300" as const,
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
} as const

export type TextStyle = typeof textStyle
export type FontWeight = typeof fontWeight
