# AR Operations (admin app)

Internal ops console for Aarogya Ruchi, split out of the customer site into
its own Cloudflare Worker. Public at **admin.aarogyaruchi.com**
(dev: dev-admin.aarogyaruchi.com); the customer site redirects old
`/admin/*` links here.

- Same session cookie as the customer site — the API allowlists both origins
  (`ALLOWED_ORIGINS` on the Go server).
- English-only by design; `noindex` everywhere.
- Map-heavy pages (live, perimeters) keep leaflet/polygon-clipping here so
  the customer bundle stays lean.

```bash
bun run dev          # local dev server on :3001 (API on :8080)
bun run deploy       # prod worker (admin.aarogyaruchi.com)
bun run deploy:dev   # dev worker (dev-admin.aarogyaruchi.com)
```

`src/lib/{api,ws,push}.ts`, `src/components/map/points-map.tsx`,
`src/config/api.ts` and `src/styles.css` are intentional copies of the
user app's files — keep them in sync when the shared surface changes.
