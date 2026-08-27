/**
 * Font configuration
 *
 * Instructions for adding fonts:
 *
 * 1. Download the required fonts:
 *    - Bricolage Grotesque: https://github.com/fonthausen/Bricolage Grotesque
 *    - Inter: https://github.com/rsms/inter/releases
 *    - Londrina Solid: https://fonts.google.com/specimen/Londrina+Solid
 *
 * 2. Place the font files in assets/fonts/:
 *    - BricolageGrotesque-Bold.ttf
 *    - BricolageGrotesque-SemiBold.ttf
 *    - BricolageGrotesque-Regular.ttf
 *    - Inter-Regular.ttf
 *    - Inter-Medium.ttf
 *    - Inter-SemiBold.ttf
 *    - Inter-Bold.ttf
 *    - LondrinaSolid-Regular.ttf
 *
 * 3. The fonts will be automatically loaded by the app layout
 */

export const fonts = {
  // Display fonts
  "BricolageGrotesque-Bold": require("../../assets/fonts/BricolageGrotesque-Bold.ttf"),
  "BricolageGrotesque-SemiBold": require("../../assets/fonts/BricolageGrotesque-SemiBold.ttf"),
  "BricolageGrotesque-Regular": require("../../assets/fonts/BricolageGrotesque-Regular.ttf"),

  // Body fonts
  "Inter-Regular": require("../../assets/fonts/Inter-Regular.ttf"),
  "Inter-Medium": require("../../assets/fonts/Inter-Medium.ttf"),
  "Inter-SemiBold": require("../../assets/fonts/Inter-SemiBold.ttf"),
  "Inter-Bold": require("../../assets/fonts/Inter-Bold.ttf"),

  // Accent font
  "LondrinaSolid-Regular": require("../../assets/fonts/LondrinaSolid-Regular.ttf"),
} as const
