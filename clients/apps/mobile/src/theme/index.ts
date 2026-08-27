/**
 * Theme exports
 * Centralizes all design system tokens
 */

export * from "./borderRadius"
export * from "./colors"
export * from "./spacing"
export * from "./typography"

/** Convenience alias used by the partner screens. */
import { textStyle } from "./typography"

export const typography = {
  h1: textStyle.h1,
  h2: textStyle.h2,
  h3: textStyle.h3,
  body: textStyle.body,
  small: textStyle.small,
} as const
