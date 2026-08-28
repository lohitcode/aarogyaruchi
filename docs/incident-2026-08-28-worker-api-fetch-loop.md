# The worker that couldn't call its own API

**Incident write-up — 2026-08-28.** How a Cloudflare same-zone fetch quirk
silently broke every server-side data fetch in the site worker, 404'd all
direct product-page loads in production, and how it was found and fixed.

| | |
|---|---|
| Commits | `be27e65` (loaders) · `32cd191` (browser recovery) · `ade08f9` (OG previews) |
| Worker versions | `6c720a1e` → `5fd9d750` (live at time of writing) |
| Status | All symptoms fixed; root cause needs a one-time Cloudflare dashboard change (§6) |

---

## 1. Background — how a page renders

The user frontend (`clients/apps/user`) is a TanStack Start worker deployed
on Cloudflare (aarogyaruchi.com). Product data lives in the Go API behind
`api.aarogyaruchi.com` (Caddy → Tencent VPS). On a full page load, the
worker **server-renders** the HTML, then the browser **hydrates** it —
React expects the client's first render to produce *identical* output to
the server HTML, or it throws away the tree and regenerates it.

```
 Browser ──▶ Cloudflare edge ──▶ user worker (SSR)
                                  │  loaders fetch catalog
                                  ▼
                             api.aarogyaruchi.com ──▶ Caddy ──▶ Go API (VPS)
                                  │
                                  └── HTML + serialized loaderData ──▶ browser
                                                                      │
                                                          hydration: re-render,
                                                          must match server HTML
```

Until this incident, catalog data was fetched by a client-side hook
(`useCatalog`) backed by a module-level cache, not by loaders. That detail
matters twice below.

## 2. The symptom chain (in the order we met it)

### 2.1 Dev-only: hydration mismatch on `/products`

`useCatalog` read the module cache **during render**. In local dev (vite
SSR + `localhost:8080`), any earlier `$slug` render warmed the *server's*
cache:

```
 vite dev server                      browser (first render)
 ┌───────────────────────┐            ┌───────────────────────┐
 │ cache WARM (earlier   │            │ fresh module, cache   │
 │ $slug load)           │            │ EMPTY                 │
 │      ↓                │            │      ↓                │
 │ SSR: FULL PRODUCT GRID│  ≠  │ client: "Loading…" <p>   │
 └───────────────────────┘            └───────────────────────┘
        → React 19: "Hydration failed" → regenerates the whole tree
        → every click in the first ~1s races the regeneration:
          buttons lose handlers, card LINKS navigate instead
        → SSR output even depended on server-cache warmth (nondeterministic)
```

### 2.2 The "correct" fix exposed the real problem on prod

The proper TanStack pattern is route loaders (data serialized to the
client, so server HTML === first client render by construction). We
shipped that (`be27e65`) — and on **production** the loader's fetch
failed, rendering *"Couldn't load products right now. Please refresh."*
The prod worker had **never** been able to fetch the API; the old code
just hid it behind a client-side refetch.

### 2.3 Root cause: the 308-to-self redirect loop

Diagnosed with a temporary diagnostic loader (deployed, read, reverted —
see §3):

```
 Worker SSR:  fetch("https://api.aarogyaruchi.com/v1/products")
                 │
                 ▼  Cloudflare edge (same zone as the worker!)
              308 Permanent Redirect
              Location: https://api.aarogyaruchi.com/v1/products
                 │  (the EXACT same URL — 20 times)
                 ▼
       TypeError: Too many redirects
```

A worker subrequest to a **proxied hostname in its own zone** is answered
by the edge with a redirect to the identical URL, forever. This is
edge-internal: browsers, curl, any external client gets a plain `200`
from the same URL — which is why the site itself worked fine.

### 2.4 Blast radius: every product page 404'd on direct load

The old `$slug` loader conflated *"API unreachable"* with *"product
missing"*:

```ts
// before — fetch failure and missing product were indistinguishable
const product = await fetchProductBySlug(slug).catch(() => null)
if (!product) throw notFound()      // ← fired for EVERY product on prod
```

Since the worker's fetch always failed, **every direct load, refresh, or
shared link of every product page returned a hard 404** on production.
Nobody noticed because in-app navigation fetches from the *browser*
(which works), so the bug only hit links opened cold — exactly the links
people share.

## 3. How it was diagnosed

1. **Hydration error diff** (React pageerror) pointed at
   `<ProductGrid>` — server rendered the grid, client rendered loading.
2. **Deployed the loader refactor** → prod now showed the fetch-failure
   branch → proved the worker-side fetch fails (previously invisible).
3. **`wrangler tail`** — no output; TanStack doesn't log loader errors.
4. **Temporary diagnostic loader** (deployed twice, then reverted):
   surfaced `TypeError: Too many redirects` with 20 identical URLs, and
   a `fetch(..., { redirect: "manual" })` probe returned
   `status=308, location=<same url>`. Browser-like headers didn't help;
   external curl to the same URL returned 200 — same-zone subrequest
   confirmed.
5. Real-slug vs bogus-slug HTTP status on prod confirmed the 404 bug
   (`/products/ragi-malt-sweet` → 404 "Product not found").

## 4. The fixes

### 4.1 Catalog data flows through route loaders (`be27e65`)

`/`, `/products`, `/products/$slug` load the catalog in `head`-less
loaders; `ProductGrid`, `PopularProducts`, `SimilarProducts` take
`products` as props. `useCatalog` is gone, and `lib/catalog.ts` carries a
warning never to read the module cache during render again. Server HTML
and the client's first render are now identical **by construction**.

### 4.2 Browser recovery instead of 404s (`32cd191`)

Loaders distinguish *fetch failed* from *product missing*:

```ts
let products: Product[] | null = null
try { products = await fetchCatalog() } catch { /* worker can't reach API */ }
const product = products?.find(...) ?? null
if (products && !product) throw notFound()   // only a RESOLVED catalog may 404
return { product, products: products ?? [], catalogFailed: products === null }
```

When `catalogFailed`, SSR renders a deterministic recovering state (same
on server and client — hydration stays exact), then
`useCatalogRecovery()` refetches **in the browser** (where the API is
reachable) and `router.invalidate()` re-runs the loaders to fill the
page. A failed browser retry surfaces the destructive error text.

```
 prod today:  SSR "Loading…" shell (200) ──▶ browser fetch (works)
              ──▶ router.invalidate() ──▶ full page
```

### 4.3 Link previews without request-time fetches (`ade08f9`)

WhatsApp/Telegram crawlers don't run JavaScript, so per-product
`og:title/og:description/og:image` must be in the SSR HTML — impossible
via the API while the loop exists. Instead, a pre-build step
(`scripts/embed-og-catalog.mjs`, runs in every `bun run build`) fetches
the catalog **at build time** and:

- downscales each product image with macOS `sips` to a ~90 KB 800 px
  JPEG under `public/og/` — WhatsApp silently drops preview images over
  ~300 KB, and our CDN originals are ~900 KB PNGs;
- writes `src/lib/og-catalog.generated.ts` (slug → name, description,
  image, dimensions, min price), committed so fresh clones typecheck.

The `$slug` route's `head()` builds the OG/Twitter tags from that
snapshot — zero request-time network. Unknown slugs keep the site card.
Previews pick up catalog changes on the next deploy.

> **TanStack gotcha found on the way:** in `createFileRoute` options,
> `head` must be declared **after** `loader`. Declared earlier, circular
> type inference collapses the loader's return type to `never` and
> `useLoaderData()` types as `undefined` (TanStack/router#4740). The
> route file carries a comment; don't "tidy" the order.

## 5. Behavior today

| Surface | SSR (crawler/no-JS) | Browser |
|---|---|---|
| `/products`, `/` | recovering shell (200); OG = site card | brief "Loading…", then full catalog |
| `/products/$slug` | recovering shell (200) + **per-product OG tags + image** | brief shell, then full product page |
| bogus slug | soft-404 (200 shell) | client recovery resolves, then "Product not found" UI |
| hydration | exact on all surfaces (verified: 0 pageerrors, cold + warm) | early clicks stable |
| in-app navigation | — | instant (warm module cache in the browser) |

## 6. Known limitations & the proper fix

What still isn't ideal, all traceable to the loop:

- Direct loads show a brief loading shell instead of server-rendered
  content (SEO + first paint).
- Bogus product URLs are soft-404s (HTTP 200) instead of hard 404s.
- Link previews refresh only on deploy.

**Proper fix (needs Cloudflare dashboard access; the wrangler token cannot
edit zone DNS/rules):**

1. Add a **grey-clouded (DNS-only)** record, e.g.
   `api-origin.aarogyaruchi.com` → Tencent VPS public IP.
2. Serve that hostname in the VPS Caddyfile next to
   `api.aarogyaruchi.com` (same upstream).
3. Point server-side fetches at it (build-time `VITE_SSR_API_BASE` or a
   wrangler var read by `fetchCatalog` on the server).

That bypasses the edge loop entirely: loaders start succeeding in the
worker, SSR renders real content, hard 404s return, and the recovery
path becomes a no-op fallback. While in the dashboard it's also worth
finding what emits the 308 (Redirect Rules / SSL settings) — that
mystery rule is the true root cause.
