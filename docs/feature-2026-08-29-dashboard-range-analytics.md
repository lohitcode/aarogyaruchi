# Dashboard placed-time range analytics (2026-08-29)

Commit `2aa8994` · deployed to prod (API blue slot + `admin.aarogyaruchi.com`
worker `5f646ddf`) on 2026-08-29.

## What changed

The admin dashboard kept its default ops view (today's `delivery_date`) and
gained a configurable analytics window:

```
 filter bar:  [Today's delivery] [Last 24h] [Last 7d] [Last 30d] | From [date ▾][time] To [date ▾][time] [Apply]
                                                                     └─ custom window, calendar popover + time input
```

- **Presets** (Last 24h / 7d / 30d) anchor to "now" at click time; the
  applied window becomes a fixed TanStack Query key, so WS-driven
  invalidations refetch the *same* window.
- **Custom From/To**: `DateTimePicker` = shadcn Calendar (single, dropdown
  caption) in a Popover + a native `<Input type="time">` sharing one
  controlled `Date`. Picking a day preserves the chosen clock time.
- "Order value" card gains an **Avg** subline (client-side division).

## Semantics — two modes, never combined

```
 GET /v1/admin/dashboard
   ├─ no start/end (default)      → day mode:  delivery_date = today (or ?delivery_date=)
   │                                orders, by_status, needs_attention, runs all keyed
   │                                on that delivery date (unchanged legacy behavior)
   └─ ?start&end (both, RFC3339)  → range mode: created_at ∈ [start, end)
                                    ├─ order_count / total_paise / by_status
                                    ├─ needs_attention (newest first, LIMIT 20)
                                    └─ runs: delivery_date between the calendar dates
                                       spanned by the window (business TZ)
                                    response adds "range": {start, end}
```

Validation (all 400): only one of start/end, unparseable RFC3339,
`start >= end`, span > 366 days. `idx_orders_created` (migration 000002)
already backs the range scan — no new migration.

SQL: `DashboardStatusCounts` / `OrdersNeedingAttention` moved to the repo's
nullable-filter style (`sqlc.narg`, params `start_ts`/`end_ts` — `end` is a
reserved SQL word); new `DashboardRunCounts` counts active/total runs for a
date span.

## Gotchas found on the way

1. **shadcn `Field` fights fixed widths on nested controls.** Field ships
   `* :w-full` (all descendants `width:100%`) which outranks `w-40` on a
   Button inside it; the Field/Button collapse onto each other and the
   From/To groups overlap at the same x. Fix: plain `label`/`div` wrappers
   around registry Calendar/Popover/Input/Button (customization at the
   call site — registry components themselves untouched).
2. **`"23:59".split(":").map(Number)` → `[23, 59, undefined]`, and
   `Number.isNaN(undefined) === false`** — the undefined slipped into
   `Date.setHours(...)` which coerces it to NaN → Invalid Date → date-fns
   `format()` throws `RangeError: Invalid time value` and the route dies
   behind the error boundary. Parse with `Number.parseInt` + `|| 0`.
3. **Base UI keeps closed popovers mounted** (`data-closed`) and makes the
   rest of the page inert while one is open — scope selectors to
   `[data-slot="popover-content"][data-open]` and expect role queries to
   "lose" buttons (e.g. Apply) while a popover is open. Day buttons expose
   `data-day="M/D/YYYY"`.
4. **A shared dev tree + parallel session = HMR reloads mid-Playwright-run.**
   Verify against `vite preview` of a real build (needs the API origin baked
   via `VITE_API_BASE_URL` at build time and that origin in the local API's
   `ALLOWED_ORIGINS`), not the dev server.

## Behavior matrix

| Action                     | Orders / value / by-status      | Runs                  | needs_attention           |
| -------------------------- | ------------------------------- | --------------------- | ------------------------- |
| open dashboard             | delivery_date = today           | that delivery date    | that date, `id` order     |
| `?delivery_date=YYYY-MM-DD`| that date                       | that date             | that date                 |
| `?start&end`               | `created_at ∈ [start, end)`     | delivery_date span    | in window, newest first   |
| preset chip (Last 24h …)   | `[now-N, now)` by created_at    | delivery_date span    | in window                 |
| custom From/To + Apply     | window by created_at            | delivery_date span    | in window                 |

Verified locally end-to-end (API curl day/range/error cases + Playwright
9/9 checks against a production build preview); prod verified via `/health`
200 and cache-busted bundle greps for the new UI.
