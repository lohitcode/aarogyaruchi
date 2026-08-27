import { useFonts } from "expo-font"
import * as SplashScreen from "expo-splash-screen"
import { useEffect } from "react"

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync()

/**
 * Custom font loading hook
 *
 * Note: Download required fonts and place in assets/fonts/:
 * - BricolageGrotesque-Bold.ttf
 * - BricolageGrotesque-SemiBold.ttf
 * - BricolageGrotesque-Regular.ttf
 * - Inter-Regular.ttf
 * - Inter-Medium.ttf
 * - Inter-SemiBold.ttf
 * - Inter-Bold.ttf
 * - LondrinaSolid-Regular.ttf
 *
 * See assets/fonts/README.md for download links
 */
export function useCustomFonts() {
  const [fontsLoaded, fontError] = useFonts({
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
  })

  // Expo Router uses Error Boundaries to catch errors
  useEffect(() => {
    if (fontError) throw fontError
  }, [fontError])

  // Hide splash screen when fonts are loaded
  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded])

  return fontsLoaded
}
