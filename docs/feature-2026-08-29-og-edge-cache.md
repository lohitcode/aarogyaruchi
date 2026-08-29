# Live link previews: edge-KV meta with event-driven invalidation

**Feature write-up — 2026-08-29.** How per-product WhatsApp/Telegram link
previews stopped being a build-time snapshot and became a live, edge-cached
layer that expires when a product is modified in the database — no rebuild.

| | |
|---|---|
| Commit | `4c3cb1b` |
| KV namespace | `OG_CATALOG` = `fa0f19e0df5c4dadbcfe9d44fade9f0b` |
| Verified live | create → preview in seconds · archive/delete → entry evicted · deleted slug falls back to site card |

---

## 1. The problem

The previous design (`docs/incident-2026-08-28-worker-api-fetch-loop.md`
§4.3) embedded a catalog snapshot at build time:
`bun run build` fetched `/v1/products` and baked each product's preview tags
into the bundle. Preview data was exactly as fresh as the last frontend
deploy. The worst case was also the most natural business moment: an admin
adds a product and announces it on WhatsApp immediately — the link got a
generic site card until the next deploy.

## 2. The design

```
 INGEST (admin edits product)                        REQUEST (WhatsApp crawler)
 ─────────────────────────────                       ─────────────────────────────
 admin browser: canvas-resize 800px JPEG (~90KB)     GET /products/<slug>
   ├─ PUT original → products/<uuid>.<ext>                 │
   └─ PUT og var   → products/<uuid>.og.jpg  (R2)          ▼
                                │                     user worker SSR
 Go API: withTx commit ─────────┤                     $slug loader reads
   go cfkv.Sync(slug):                               env.OG_CATALOG.get(slug)
     read live row → upsert/delete KV                     │  KV BINDING — no
     {name, description, image,                           ▼  same-zone fetch,
      minPricePaise}                                 ogMetaForProduct(live)
                                │                     ?? build-time snapshot
 Cloudflare KV  ◀───────────────┘  (key = slug,            ?? site card
 (event-driven, TTL-free)           no rebuild)                │
                                                               ▼
                                                    per-product og:* tags
```

Why KV writes go through the images-cdn worker instead of
`api.cloudflare.com`: the VPS holds no Cloudflare credentials by design
(see `uploads.go`) — it already shares `R2_UPLOAD_SECRET` with the CDN
worker, so the worker exposes an HMAC-authed `PUT/DELETE /og/{slug}` and
does the KV write through its own binding. Zero new secrets; the signature
material is `"ogsync:" + slug + ":" + exp` (slug-scoped, 15-min TTL).

Three cache layers, honestly stated:

| Layer | Freshness | Who controls it |
|---|---|---|
| `OG_CATALOG` KV | Event-driven (DB commit → overwrite/delete) | us |
| Cloudflare KV edge propagation | ≤ ~60s eventual consistency | Cloudflare |
| WhatsApp's own per-URL card cache | days; **no purge API exists** | WhatsApp |

The third layer is platform reality for everyone including Amazon: *new*
products get a fresh URL → fresh crawl → instant card. *Edited* products
keep the old card until WhatsApp's cache ages out; sharing with a `?v=`
query busts it manually.

## 3. Pieces

### images-cdn worker (`clients/workers/images-cdn`)
- `PUT /og/{slug}?exp=&sig=` / `DELETE …`: validates slug shape, HMAC
  (material includes the slug), JSON value ≤ 8 KB, then
  `env.OG_CATALOG.put/delete`. No CORS — server-to-server only.
- `/upload` gains `stem=<uuid>&v=og`: the og variant lands at
  `products/<stem>.og.jpg` next to the original `products/<stem>.<ext>`,
  forced JPEG. This keeps the **og URL derivable from the original**
  (`<original minus ext>.og.jpg`) — no DB column, no API schema change.

### Go (`server/internal/cfkv`, hooks in `admin_manage.go`)
- `cfkv.Syncer.SyncProduct(ctx, q, slug)`: reads the live row via
  `GetProductBySlug` + `ListCatalogVariants`; live+available → upsert,
  archived/unavailable/deleted → delete key. **A DB error bails instead of
  evicting** a good entry. The image URL prefers the derived `.og.jpg`
  variant after a HEAD check (products whose image predates paired uploads
  fall back to the original).
- All four product mutations funnel into `h.syncOgCatalog(slugs...)` — one
  detached goroutine (30s budget, `context.Background()` — `r.Context()`
  dies with the response) after `withTx` commits. Update captures the
  pre-update slug so renames evict the old key; archive/delete capture
  theirs inside the tx. The first true post-commit goroutine in the
  codebase.
- `CreateImageUploadToken` now mints a UUID stem and returns
  `og_upload_url` alongside `upload_url` (same exp/sig).

### Admin app (`image-upload.tsx`)
After the main upload PUT, the browser canvas-resizes the same file
(`createImageBitmap` → 800px max edge → JPEG q0.72, ~90 KB) and PUTs it to
`og_upload_url`. Best-effort: failure means a preview without the small
image until a re-upload. `onChange(url)` is unchanged — the og URL stays
derivable.

### User worker (`clients/apps/user`)
- `wrangler.jsonc`: `kv_namespaces` binding `OG_CATALOG`
  (`make-dev-wrangler.mjs` strips it for dev — dev keeps snapshot-only
  behavior and must not read prod previews).
- `src/server.ts` + **the gotcha**: a custom worker entry threads
  `env` through `{ context: { env } }` so loaders reach it as
  `serverContext.env` during SSR. But the TanStack plugin's entry alias
  (`virtual:tanstack-start-server-entry`) only applies to TanStack's own
  environment wiring — the wrangler `main` specifier
  `@tanstack/react-start/server-entry` resolves **directly to the package's
  passthrough default entry** and silently ignores `src/server.ts`. Fix:
  a `resolve.alias` entry in `vite.config.ts` mapping that exact specifier
  to `src/server.ts`. Symptom before the fix: `serverContext` arrived empty.
- `$slug` loader returns `og` (normalized KV payload) in loaderData;
  `head()` uses `loaderData.og ?? snapshot ?? site card`. Client-side
  navigations (no serverContext) use the snapshot — irrelevant to crawlers,
  which always SSR. Hydration stays exact: the client hydrates from
  dehydrated SSR loaderData and never re-runs loaders for first render.

### Seed / force-resync (`clients/apps/user/scripts/sync-og-kv.mjs`)
Reads the live catalog, resolves each image (committed `public/og/*.jpg`
build asset → derived `.og.jpg` variant → original), bulk-puts via
`wrangler kv bulk put`. Run once at rollout; keep for drift repair.

## 4. Behavior matrix (verified on prod)

| Event | KV | Crawler sees |
|---|---|---|
| New product (no deploy) | upserted by hook | **full product card** (the gap that motivated this) |
| Edit name/price/description | upserted | old card until WhatsApp cache ages (or `?v=`) |
| Image re-upload in admin | upserted, og variant preferred | same as above |
| Archive / permanent delete | key deleted | site card |
| Bogus slug | never had a key | site card |
| KV read fails / empty | — | build-time snapshot (still deployed) |
| cfkv disabled (no CDN config, dev) | never writes | snapshot (dev: built from dev-api) |

## 5. Follow-ups

- Grey-clouded `api-origin.aarogyaruchi.com` (dashboard DNS) — still the
  proper fix for real SSR page content and hard 404s; independent of
  previews.
- If catalog mutations ever become high-frequency, add per-isolate memoization
  of KV reads; unnecessary at current scale (KV reads are sub-ms bindings).
