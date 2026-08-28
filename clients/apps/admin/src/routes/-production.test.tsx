import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AdminProduction, groupPrepByProduct, variantLabel } from "./production"
import type { BatchDetail } from "../lib/admin"

const prep = (
  overrides: Partial<BatchDetail["preparation_summary"][number]>,
): BatchDetail["preparation_summary"][number] => ({
  variant_id: 1,
  product_id: 1,
  name: "Item",
  slug: "item",
  size_label: "",
  unit: "",
  total_quantity: 1,
  order_count: 1,
  ...overrides,
})

describe("groupPrepByProduct", () => {
  it("sums variants of the same product into one group with the right total", () => {
    const rows = [
      prep({ variant_id: 11, product_id: 1, name: "Ragi Jawa", total_quantity: 12 }),
      prep({ variant_id: 12, product_id: 1, name: "Ragi Jawa", total_quantity: 3 }),
      prep({ variant_id: 21, product_id: 2, name: "Sprouts", total_quantity: 22 }),
    ]

    const groups = groupPrepByProduct(rows)
    expect(groups).toHaveLength(2)
    expect(groups[0].name).toBe("Sprouts")
    expect(groups[0].totalQty).toBe(22)
    expect(groups[1].name).toBe("Ragi Jawa")
    expect(groups[1].totalQty).toBe(15)
    expect(groups[1].variants.map((v) => v.variant_id)).toEqual([11, 12])
  })

  it("sorts by total quantity descending, biggest prep first", () => {
    const rows = [
      prep({ product_id: 1, name: "A", total_quantity: 2 }),
      prep({ product_id: 2, name: "B", total_quantity: 9 }),
      prep({ product_id: 3, name: "C", total_quantity: 5 }),
    ]

    expect(groupPrepByProduct(rows).map((g) => g.name)).toEqual(["B", "C", "A"])
  })

  it("breaks quantity ties alphabetically for a stable sheet", () => {
    const rows = [
      prep({ product_id: 1, name: "Zebra", total_quantity: 4 }),
      prep({ product_id: 2, name: "Alpha", total_quantity: 4 }),
    ]

    expect(groupPrepByProduct(rows).map((g) => g.name)).toEqual(["Alpha", "Zebra"])
  })

  it("returns an empty list for an empty batch", () => {
    expect(groupPrepByProduct([])).toEqual([])
  })
})

describe("variantLabel", () => {
  it("joins size and unit when both exist", () => {
    expect(variantLabel({ size_label: "250 g", unit: "pack", slug: "s" })).toBe("250 g · pack")
  })

  it("shows whichever field exists alone", () => {
    expect(variantLabel({ size_label: "500 ml", unit: "", slug: "s" })).toBe("500 ml")
    expect(variantLabel({ size_label: "", unit: "box", slug: "s" })).toBe("box")
  })

  it("falls back to the slug when both are blank", () => {
    expect(variantLabel({ size_label: "", unit: "", slug: "plain" })).toBe("plain")
  })
})

/**
 * Regression: on prod the page 404'd before the day's first order —
 * /batches/current reports batch_id 0 until checkout creates the row, and
 * the page must render an empty sheet from the resolved header instead of
 * fetching /batches/0.
 */
describe("AdminProduction with no batch yet today", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("renders the empty sheet from the resolved header, never calls /batches/0", async () => {
    const calls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        calls.push(url)
        if (url.endsWith("/v1/auth/session")) {
          return new Response(
            JSON.stringify({
              authenticated: true,
              type: "admin",
              admin: { id: 1, phone: "+919000000001", name: "Admin", role: "super_admin" },
            }),
            { status: 200 },
          )
        }
        if (url.endsWith("/v1/admin/batches/current")) {
          return new Response(
            JSON.stringify({
              batch_id: 0,
              order_date: "2026-08-28",
              delivery_date: "2026-08-29",
              cutoff_policy: "cutoff=00:00 tz=Asia/Kolkata",
              status: "open",
            }),
            { status: 200 },
          )
        }
        if (url.endsWith("/v1/admin/batches")) {
          return new Response(
            JSON.stringify({
              batches: [
                {
                  batch_id: 42,
                  order_date: "2026-08-27",
                  delivery_date: "2026-08-28",
                  cutoff_policy: "cutoff=00:00 tz=Asia/Kolkata",
                  status: "closed",
                  order_count: 6,
                  cancelled_count: 0,
                  delivered_count: 6,
                  total_paise: 90000,
                },
              ],
            }),
            { status: 200 },
          )
        }
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <AdminProduction />
      </QueryClientProvider>,
    )

    await waitFor(() =>
      expect(
        screen.getByText(/No orders in today's batch yet/i),
      ).toBeTruthy(),
    )
    expect(screen.getAllByText(/delivering 2026-08-29/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/failed to load/i)).toBeNull()
    expect(calls.some((c) => c.includes("/batches/0"))).toBe(false)

    // Pinning an older batch from the picker loads it for real.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "42" } })
    await waitFor(() => expect(calls.some((c) => c.includes("/batches/42"))).toBe(true))
  })
})
