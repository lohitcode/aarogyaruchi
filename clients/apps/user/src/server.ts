// Custom worker entry (the TanStack Start plugin resolves src/server as the
// server entry for both prod and dev deploys). Cloudflare module workers
// receive (request, env, ctx); TanStack's default entry drops `env`, so this
// threads it through the request context — loaders reach it as
// `serverContext.env` during SSR (used by the $slug route to read the
// OG_CATALOG KV namespace for live link-preview tags).
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server"

const handler = createStartHandler(defaultStreamHandler)

export default {
  fetch(request: Request, env: Env, _ctx: ExecutionContext): Response | Promise<Response> {
    // createStartHandler seeds the SSR middleware context from the second
    // argument's `context` and spreads it onto loader options as
    // `serverContext`; the cast sidesteps the handler's narrow `BaseContext`
    // typing (Register augmentation doesn't reach this signature).
    return handler(request, { context: { env } } as Parameters<typeof handler>[1])
  },
}
