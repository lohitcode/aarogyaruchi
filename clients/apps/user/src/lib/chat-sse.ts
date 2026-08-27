/**
 * Typed SSE parsing for the /chat/stream endpoint.
 *
 * The server emits named events, each with a single-line JSON payload:
 *   event: delta     data: {"text":"..."}
 *   event: fallback  data: {"reason":"unsupported_locale"}
 *   event: done      data: {"products":["ragi-jawa"]}
 *   event: error     data: {"kind":"rate_limited"|"provider_error"|"bad_request"}
 */

export type ChatErrorKind =
  | "rate_limited"
  | "provider_error"
  | "bad_request"

export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "fallback"; reason: string }
  | { type: "done"; products: string[] }
  | { type: "error"; kind: ChatErrorKind; message?: string }

type ServerEventShape = {
  text?: unknown
  reason?: unknown
  products?: unknown
  kind?: unknown
  message?: unknown
}

/** Extract a text payload, tolerating chunks split across network reads. */
function parseEvent(rawEvent: string): ChatStreamEvent | null {
  let eventName = "message"
  const dataLines: string[] = []

  for (const line of rawEvent.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim()
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim())
    }
    // Per the SSE spec, comment lines (":") and other fields are ignored.
  }

  const data = dataLines.join("\n")
  if (!data) return null

  let payload: ServerEventShape
  try {
    payload = JSON.parse(data) as ServerEventShape
  } catch {
    return null
  }

  switch (eventName) {
    case "delta":
      return { type: "delta", text: typeof payload.text === "string" ? payload.text : "" }
    case "fallback":
      return {
        type: "fallback",
        reason: typeof payload.reason === "string" ? payload.reason : "",
      }
    case "done":
      return {
        type: "done",
        products: Array.isArray(payload.products)
          ? payload.products.filter((p): p is string => typeof p === "string")
          : [],
      }
    case "error":
      return {
        type: "error",
        kind: isChatErrorKind(payload.kind) ? payload.kind : "provider_error",
        message: typeof payload.message === "string" ? payload.message : undefined,
      }
    default:
      return null
  }
}

function isChatErrorKind(value: unknown): value is ChatErrorKind {
  return (
    value === "rate_limited" ||
    value === "provider_error" ||
    value === "bad_request"
  )
}

/**
 * Read an SSE body and invoke `onEvent` for every parsed event. Returns a
 * promise that resolves when the stream ends (or rejects on network errors,
 * which callers surface as an offline state).
 */
export async function readChatSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Events are separated by a blank line; \r\n is tolerated.
    const parts = buffer.split(/\n\n|\r\n\r\n/)
    buffer = parts.pop() ?? ""
    for (const part of parts) {
      const event = parseEvent(part)
      if (event) onEvent(event)
    }
  }

  // Flush any trailing event that wasn't followed by a blank line.
  if (buffer.trim()) {
    const event = parseEvent(buffer)
    if (event) onEvent(event)
  }
}
