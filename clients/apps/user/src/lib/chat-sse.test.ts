import { describe, expect, it } from "vitest"
import { readChatSseStream, type ChatStreamEvent } from "./chat-sse"

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

async function collect(chunks: string[]): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = []
  await readChatSseStream(streamOf(chunks), (event) => events.push(event))
  return events
}

describe("readChatSseStream", () => {
  it("parses delta, fallback, done and error events", async () => {
    const events = await collect([
      'event: delta\ndata: {"text":"Ragi"}\n\n',
      'event: delta\ndata: {"text":" Jawa"}\n\n',
      'event: fallback\ndata: {"reason":"unsupported_locale"}\n\n',
      'event: done\ndata: {"products":["ragi-jawa"]}\n\n',
    ])
    expect(events).toEqual([
      { type: "delta", text: "Ragi" },
      { type: "delta", text: " Jawa" },
      { type: "fallback", reason: "unsupported_locale" },
      { type: "done", products: ["ragi-jawa"] },
    ])
  })

  it("reassembles events split across chunk boundaries", async () => {
    const events = await collect([
      'event: del',
      'ta\ndata: {"te',
      'xt":"split"}\n',
      '\n',
    ])
    expect(events).toEqual([{ type: "delta", text: "split" }])
  })

  it("parses error events with kinds", async () => {
    const events = await collect(['event: error\ndata: {"kind":"rate_limited"}\n\n'])
    expect(events).toEqual([
      { type: "error", kind: "rate_limited", message: undefined },
    ])
  })

  it("ignores malformed data and unknown events", async () => {
    const events = await collect([
      ": keep-alive\n\n",
      "event: delta\ndata: not-json\n\n",
      'event: mystery\ndata: {"text":"x"}\n\n',
      "data: no-event-name-without-known-shape\n\n",
    ])
    expect(events).toEqual([])
  })

  it("flushes a trailing event that lacks a final blank line", async () => {
    const events = await collect(['event: delta\ndata: {"text":"tail"}'])
    expect(events).toEqual([{ type: "delta", text: "tail" }])
  })

  it("tolerates CRLF separators", async () => {
    const events = await collect([
      'event: delta\r\ndata: {"text":"crlf"}\r\n\r\n',
      'event: done\r\ndata: {"products":[]}\r\n\r\n',
    ])
    expect(events).toEqual([
      { type: "delta", text: "crlf" },
      { type: "done", products: [] },
    ])
  })

  it("defaults unknown error kinds to provider_error", async () => {
    const events = await collect(['event: error\ndata: {"kind":"weird"}\n\n'])
    expect(events[0]?.type).toBe("error")
    expect(events[0]?.type === "error" && events[0].kind).toBe("provider_error")
  })
})
