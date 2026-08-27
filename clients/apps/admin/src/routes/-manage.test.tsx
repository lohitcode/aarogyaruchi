import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AdminManage, filterAndSortProducts, type AdminProductRow } from "./manage"
import { uniqueCategories } from "../components/admin/category-combobox"

const product = (overrides: Partial<AdminProductRow>): AdminProductRow => ({
  id: 1,
  slug: "item",
  name: "Item",
  is_featured: false,
  is_available: true,
  sort_order: 0,
  archived: false,
  variant_count: 1,
  min_price_paise: 5000,
  order_count: 0,
  ...overrides,
})

const CATALOG: AdminProductRow[] = [
  product({ id: 1, slug: "alpha", name: "Alpha Drink", category: "Beverages", min_price_paise: 6000, order_count: 2 }),
  product({ id: 2, slug: "beta", name: "Beta Bowl", category: "Meals", min_price_paise: 2000, order_count: 9 }),
  product({ id: 3, slug: "gamma", name: "Gamma Soup", category: "Beverages", min_price_paise: 4000, order_count: 2 }),
]

describe("filterAndSortProducts", () => {
  it("keeps admin order by default and does not reorder", () => {
    expect(filterAndSortProducts(CATALOG, "", "default").map((p) => p.id)).toEqual([1, 2, 3])
  })

  it("searches name, slug, and category case-insensitively", () => {
    expect(filterAndSortProducts(CATALOG, "beta bowl", "default").map((p) => p.id)).toEqual([2])
    expect(filterAndSortProducts(CATALOG, "GAMMA", "default").map((p) => p.id)).toEqual([3])
    expect(filterAndSortProducts(CATALOG, "beverages", "default").map((p) => p.id)).toEqual([1, 3])
    expect(filterAndSortProducts(CATALOG, "nope", "default")).toEqual([])
  })

  it("sorts by price ascending and descending", () => {
    expect(filterAndSortProducts(CATALOG, "", "price-asc").map((p) => p.id)).toEqual([2, 3, 1])
    expect(filterAndSortProducts(CATALOG, "", "price-desc").map((p) => p.id)).toEqual([1, 3, 2])
  })

  it("sorts by order count with price as the tie-breaker", () => {
    expect(filterAndSortProducts(CATALOG, "", "orders-desc").map((p) => p.id)).toEqual([2, 1, 3])
    expect(filterAndSortProducts(CATALOG, "", "orders-asc").map((p) => p.id)).toEqual([3, 1, 2])
  })

  it("combines search with sort", () => {
    expect(filterAndSortProducts(CATALOG, "beverages", "orders-desc").map((p) => p.id)).toEqual([1, 3])
  })
})

describe("uniqueCategories", () => {
  it("derives sorted, de-duplicated categories from product rows", () => {
    const rows = [
      { category: "Meals" },
      { category: " Beverages " },
      { category: "Beverages" },
      { category: null },
      { category: "" },
      {},
    ]
    expect(uniqueCategories(rows)).toEqual(["Beverages", "Meals"])
  })
})

function stubFetch(products: AdminProductRow[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
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
      if (url.endsWith("/v1/admin/products")) {
        return new Response(JSON.stringify({ products }), { status: 200 })
      }
      return new Response("{}", { status: 200 })
    }),
  )
}

function renderManage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AdminManage />
    </QueryClientProvider>,
  )
}

const firstRowName = () => screen.getAllByRole("row")[1].textContent ?? ""

describe("AdminManage products tab", () => {
  beforeEach(() => {
    stubFetch(CATALOG)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("picks an existing category or creates a new one from typed text", async () => {
    renderManage()
    await waitFor(() => expect(screen.getByText("Beta Bowl")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "New product" }))
    const trigger = screen.getByRole("combobox", { name: "Category" })
    fireEvent.click(trigger)

    // Existing categories are offered straight from the products query.
    expect(screen.getByRole("option", { name: "Beverages" })).toBeTruthy()

    // Typing something new offers to create it; picking it sets the field.
    fireEvent.change(screen.getByPlaceholderText("Search or type a new category…"), {
      target: { value: "Desserts" },
    })
    fireEvent.click(screen.getByRole("option", { name: /Create .*Desserts/ }))
    expect(trigger.textContent).toContain("Desserts")
  })

  it("hides the heading and tabs while a product editor is open", async () => {
    renderManage()
    await waitFor(() => expect(screen.getByText("Alpha Drink")).toBeTruthy())

    expect(screen.getByRole("heading", { name: "Manage" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Products" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "New product" }))

    expect(screen.queryByRole("heading", { name: "Manage" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Products" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull()
    expect(screen.getByRole("heading", { name: "New product" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.getByRole("heading", { name: "Manage" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Products" })).toBeTruthy()
  })

  it("filters rows by the search box", async () => {
    renderManage()
    await waitFor(() => expect(screen.getByText("Beta Bowl")).toBeTruthy())

    fireEvent.change(screen.getByRole("searchbox", { name: "Search products" }), {
      target: { value: "soup" },
    })

    expect(screen.getByText("1 of 3 products")).toBeTruthy()
    expect(screen.getByText("Gamma Soup")).toBeTruthy()
    expect(screen.queryByText("Alpha Drink")).toBeNull()
    expect(screen.queryByText("Beta Bowl")).toBeNull()
  })

  it("reorders rows when the sort changes", async () => {
    renderManage()
    await waitFor(() => expect(screen.getByText("Beta Bowl")).toBeTruthy())

    expect(firstRowName()).toContain("Alpha Drink")

    const chooseSort = (label: string) => {
      const trigger = screen.getByRole("combobox", { name: "Sort products" })
      fireEvent.keyDown(trigger, { key: "ArrowDown" })
      fireEvent.keyDown(screen.getByRole("option", { name: label }), { key: "Enter" })
    }

    chooseSort("Price: low to high")
    expect(firstRowName()).toContain("Beta Bowl")

    chooseSort("Most ordered")
    expect(firstRowName()).toContain("Beta Bowl")

    chooseSort("Least ordered")
    expect(firstRowName()).toContain("Gamma Soup")
  })
})
