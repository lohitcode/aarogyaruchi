import { Platform } from "react-native"

/**
 * Dev builds talk to the local Go server; release builds hit production.
 * Override with EXPO_PUBLIC_API_URL in .env for custom environments.
 */
const DEV_API =
  Platform.OS === "android" ? "http://10.0.2.2:8080" : "http://localhost:8080"

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (process.env.EXPO_PUBLIC_ENV === "production" ? "https://api.aarogyaruchi.com" : DEV_API)
