import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

// Separate from vite.config.ts so the Cloudflare/TanStack Start plugins
// don't interfere with unit tests.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
  },
})
