import { describe, expect, it } from "vitest"
import { groupPrepByProduct, variantLabel } from "./production"
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
