import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { I18nProvider } from "../../i18n"
import { ChatWidget } from "./chat-widget"

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
  return { ok: true, body } as unknown as Response
}

function renderWidget() {
  return render(
    <I18nProvider>
      <ChatWidget />
    </I18nProvider>,
  )
}

function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: /aarogya ruchi assistant/i }))
}

function typeAndSend(text: string) {
  const input = screen.getByLabelText(/ask about our products/i)
  fireEvent.change(input, { target: { value: text } })
  fireEvent.submit(input.closest("form") as HTMLFormElement)
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Object.defineProperty(window.navigator, "onLine", {
    value: true,
    configurable: true,
  })
})

describe("ChatWidget", () => {
  it("renders a labelled launcher and opens the panel with a welcome", () => {
    renderWidget()
    openPanel()

    expect(screen.getByRole("dialog", { name: /aarogya ruchi assistant/i })).toBeTruthy()
    expect(screen.getByText(/ask me anything about our ragi drinks/i)).toBeTruthy()
    expect(screen.getByLabelText(/ask about our products/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: /clear conversation/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /close chat/i })).toBeTruthy()
  })

  it("shows an offline error without calling the API when offline", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    Object.defineProperty(window.navigator, "onLine", {
      value: false,
      configurable: true,
    })

    renderWidget()
    openPanel()
    typeAndSend("what is ragi jawa?")

    expect(
      await screen.findByText(/check your connection and try again/i),
    ).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy()
  })

  it("streams a reply and persists the exchange locally", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'event: delta\ndata: {"text":"Ragi Jawa is a warm, "}\n\n',
        'event: delta\ndata: {"text":"calcium-rich millet drink."}\n\n',
        'event: done\ndata: {"products":[]}\n\n',
      ]),
    )
    vi.stubGlobal("fetch", fetchMock)

    renderWidget()
    openPanel()
    typeAndSend("what is ragi jawa?")

    await waitFor(() => {
      expect(
        screen.getByText(/Ragi Jawa is a warm, calcium-rich millet drink./),
      ).toBeTruthy()
    })

    // Request payload carries the UI locale and the API's wire format
    // ({role, content}) — not the storage shape.
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe("POST")
    const payload = JSON.parse(init.body as string)
    expect(payload.locale).toBe("en")
    expect(payload.messages).toEqual([
      { role: "user", content: "what is ragi jawa?" },
    ])

    // Only completed exchanges are stored in the browser.
    await waitFor(() => {
      const stored = JSON.parse(
        localStorage.getItem("aarogya_ruchi_chat") ?? "[]",
      )
      expect(stored).toHaveLength(2)
      expect(stored[0]).toMatchObject({ role: "user", text: "what is ragi jawa?" })
      expect(stored[1]).toMatchObject({
        role: "assistant",
        text: "Ragi Jawa is a warm, calcium-rich millet drink.",
      })
    })
  })

  it("surfaces a rate-limit error event from the server with a retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse(['event: error\ndata: {"kind":"rate_limited"}\n\n']),
      ),
    )

    renderWidget()
    openPanel()
    typeAndSend("hello")

    expect(await screen.findByText(/too many messages/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy()

    // Error bubbles are not persisted — only the user's message remains.
    await waitFor(() => {
      const stored = JSON.parse(
        localStorage.getItem("aarogya_ruchi_chat") ?? "[]",
      )
      expect(stored).toEqual([
        expect.objectContaining({ role: "user", text: "hello" }),
      ])
    })
  })

  it("treats a failed fetch as an offline error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))

    renderWidget()
    openPanel()
    typeAndSend("hello")

    expect(await screen.findByText(/check your connection/i)).toBeTruthy()
  })

  it("clearing the conversation removes local history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse(['event: done\ndata: {"products":[]}\n\n']),
      ),
    )

    renderWidget()
    openPanel()
    typeAndSend("hi")
    await waitFor(() => {
      expect(localStorage.getItem("aarogya_ruchi_chat")).not.toBeNull()
    })

    fireEvent.click(screen.getByRole("button", { name: /clear conversation/i }))

    expect(localStorage.getItem("aarogya_ruchi_chat")).toBeNull()
    expect(screen.getByText(/ask me anything/i)).toBeTruthy()
  })
})
