import { describe, expect, it } from "vitest"
import { detectLocale } from "."

describe("detectLocale", () => {
  it("prefers an explicitly stored choice", () => {
    expect(detectLocale("te", ["hi-IN", "en-US"])).toBe("te")
    expect(detectLocale("hi", ["te-IN"])).toBe("hi")
    expect(detectLocale("en", ["te-IN", "hi-IN"])).toBe("en")
  })

  it("falls back to the first supported browser language", () => {
    expect(detectLocale(null, ["te-IN", "en-US"])).toBe("te")
    expect(detectLocale(null, ["hi-IN", "en-US"])).toBe("hi")
    expect(detectLocale(null, ["en-US", "te-IN"])).toBe("en")
    expect(detectLocale(null, ["en"])).toBe("en")
  })

  it("ignores unsupported languages and falls back to English", () => {
    expect(detectLocale(null, ["fr-FR", "de-DE"])).toBe("en")
    expect(detectLocale(null, [])).toBe("en")
  })

  it("ignores invalid stored values", () => {
    expect(detectLocale("klingon", ["te-IN"])).toBe("te")
    expect(detectLocale("", ["hi-IN"])).toBe("hi")
  })

  it("matches browser tags case-insensitively", () => {
    expect(detectLocale(null, ["TE-in"])).toBe("te")
    expect(detectLocale(null, ["HI"])).toBe("hi")
  })
})
