import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aarogyaruchi/ui/components/select";
import {
  adminApi,
  type AdminRow,
  type LocalityRow,
  type PartnerRow,
} from "../lib/admin";
import { api, formatPaise } from "../lib/api";
import { useAdminSession } from "../lib/admin";
import {
  CategoryCombobox,
  uniqueCategories,
} from "../components/admin/category-combobox";
import { ImageUpload } from "../components/admin/image-upload";
import { LocalityDialog } from "../components/admin/locality-dialog";

export const Route = createFileRoute("/manage")({
  component: AdminManage,
});

const TABS = [
  "Products",
  "Localities",
  "Partners",
  "Admins",
  "Settings",
] as const;
type Tab = (typeof TABS)[number];

export function AdminManage() {
  const [tab, setTab] = useState<Tab>("Products");
  // The product editor is a focused full-page view: while it is open the
  // heading + tab strip step aside.
  const [editorOpen, setEditorOpen] = useState(false);
  const handleEditingChange = useCallback(
    (open: boolean) => setEditorOpen(open),
    []
  );
  const { admin } = useAdminSession();
  const isSuper = admin?.role === "super_admin";

  return (
    <div>
      {!editorOpen && (
        <>
          <h1 className="text-xl font-semibold text-neutral-900">Manage</h1>
          <div className="mt-4 flex gap-1 overflow-x-auto border-b border-neutral-200">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`shrink-0 px-3 py-2 text-sm whitespace-nowrap ${
                  tab === t
                    ? "-mb-px border-b-2 border-neutral-900 font-medium text-neutral-900"
                    : "text-neutral-500 hover:text-neutral-800"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </>
      )}

      {!isSuper && tab !== "Products" && tab !== "Localities" ? (
        <p className="mt-6 text-sm text-neutral-500">
          These management actions require the super admin role.
        </p>
      ) : (
        <div className="mt-5">
          {tab === "Products" && (
            <ProductsTab onEditingChange={handleEditingChange} />
          )}
          {tab === "Localities" && <LocalitiesTab />}
          {tab === "Partners" && <PartnersTab />}
          {tab === "Admins" && <AdminsTab />}
          {tab === "Settings" && <SettingsTab />}
        </div>
      )}
    </div>
  );
}

// ---- Products ----

type AdminVariantRow = {
  id?: number;
  slug?: string;
  size_label: string;
  unit: string;
  price_rupees: string;
  is_available: boolean;
  archived?: boolean;
};

type EditableProduct = {
  id?: number;
  slug: string;
  name: string;
  description: string;
  category: string;
  image_url: string;
  ingredients: string;
  tags: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  is_featured: boolean;
  is_available: boolean;
  variants: AdminVariantRow[];
};

export type AdminProductRow = {
  id: number;
  slug: string;
  name: string;
  category?: string;
  image_url?: string;
  is_featured: boolean;
  is_available: boolean;
  archived: boolean;
  variant_count: number;
  min_price_paise: number;
  order_count: number;
};

const emptyProduct: EditableProduct = {
  slug: "",
  name: "",
  description: "",
  category: "",
  image_url: "",
  ingredients: "",
  tags: "",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
  fiber: "",
  is_featured: false,
  is_available: true,
  variants: [
    { size_label: "Regular", unit: "", price_rupees: "", is_available: true },
  ],
};

const PRODUCT_SORT_OPTIONS = [
  { value: "default", label: "Popularity (default)" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "orders-desc", label: "Most ordered" },
  { value: "orders-asc", label: "Least ordered" },
] as const;

type ProductSort = (typeof PRODUCT_SORT_OPTIONS)[number]["value"];

const PRODUCT_SORTERS: Record<
  ProductSort,
  ((a: AdminProductRow, b: AdminProductRow) => number) | null
> = {
  default: null,
  "price-asc": (a, b) => a.min_price_paise - b.min_price_paise,
  "price-desc": (a, b) => b.min_price_paise - a.min_price_paise,
  "orders-desc": (a, b) =>
    b.order_count - a.order_count || b.min_price_paise - a.min_price_paise,
  "orders-asc": (a, b) =>
    a.order_count - b.order_count || a.min_price_paise - b.min_price_paise,
};

export function filterAndSortProducts(
  products: AdminProductRow[],
  search: string,
  sort: ProductSort
): AdminProductRow[] {
  const q = search.trim().toLowerCase();
  const filtered = q
    ? products.filter((p) =>
        [p.name, p.slug, p.category ?? ""].some((field) =>
          field.toLowerCase().includes(q)
        )
      )
    : products;
  const sorter = PRODUCT_SORTERS[sort];
  return sorter ? [...filtered].sort(sorter) : filtered;
}

function ProductsTab({
  onEditingChange,
}: {
  onEditingChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EditableProduct | null>(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProductSort>("default");
  const { data, isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => adminApi.products(),
  });
  const products = (data?.products ?? []) as AdminProductRow[];

  useEffect(() => {
    onEditingChange(editing !== null);
  }, [editing, onEditingChange]);

  const visibleProducts = useMemo(
    () => filterAndSortProducts(products, search, sort),
    [products, search, sort]
  );

  // Category options live only as product rows: derive them from the same
  // query so deleting the last product of a category drops it from the list.
  const categories = useMemo(() => uniqueCategories(products), [products]);

  const openEditor = async (id: number | null) => {
    setMessage("");
    if (id === null) {
      setEditing({
        ...emptyProduct,
        variants: [{ ...emptyProduct.variants[0] }],
      });
      return;
    }
    try {
      const p = await api.get<Record<string, unknown>>(
        `/v1/admin/products/${id}`
      );
      const variants = (p.variants as AdminProductRow2[] | undefined) ?? [];
      const n = (p.nutrition ?? {}) as Record<string, string>;
      setEditing({
        id: p.id as number,
        slug: p.slug as string,
        name: p.name as string,
        description: (p.description as string) ?? "",
        category: (p.category as string) ?? "",
        image_url: (p.image_url as string) ?? "",
        ingredients: ((p.ingredients as string[]) ?? []).join(", "),
        tags: ((p.tags as string[]) ?? []).join(", "),
        calories: n.calories ?? "",
        protein: n.protein ?? "",
        carbs: n.carbs ?? "",
        fat: n.fat ?? "",
        fiber: n.fiber ?? "",
        is_featured: p.is_featured as boolean,
        is_available: p.is_available as boolean,
        variants: variants.map((v) => ({
          id: v.id,
          slug: v.slug,
          size_label: v.size_label ?? "",
          unit: v.unit ?? "",
          price_rupees: (v.price_paise / 100).toString(),
          is_available: v.is_available,
          archived: v.archived,
        })),
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load product");
    }
  };

  const archive = useMutation({
    mutationFn: (id: number) => adminApi.archiveProduct(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-products"] }),
  });

  const permanentDelete = useMutation({
    mutationFn: (id: number) => adminApi.permanentDeleteProduct(id),
    onSuccess: () => {
      setMessage("Deleted permanently — the slug is free to reuse.");
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e) =>
      setMessage(e instanceof Error ? e.message : "Delete failed"),
  });

  const save = useMutation({
    mutationFn: async (p: EditableProduct) => {
      const body = {
        slug: p.slug || undefined,
        name: p.name,
        description: p.description || undefined,
        category: p.category || undefined,
        image_url: p.image_url || undefined,
        ingredients: p.ingredients
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        tags: p.tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        nutrition: {
          calories: p.calories,
          protein: p.protein,
          carbs: p.carbs,
          fat: p.fat,
          fiber: p.fiber,
        },
        is_featured: p.is_featured,
        is_available: p.is_available,
        variants: p.variants
          .filter((v) => v.size_label.trim() || v.price_rupees)
          .map((v) => ({
            ...(v.id ? { id: v.id } : {}),
            slug: v.slug || undefined,
            size_label: v.size_label.trim(),
            unit: v.unit.trim() || undefined,
            price_paise: Math.round(
              Number(v.price_rupees.replace(/[^\d.]/g, "")) * 100
            ),
            is_available: v.is_available,
          })),
      };
      return p.id
        ? adminApi.updateProduct(p.id, body)
        : adminApi.createProduct(body);
    },
    onSuccess: () => {
      setMessage("Saved.");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e) => setMessage(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <div>
      {editing ? (
        <ProductEditorForm
          product={editing}
          busy={save.isPending}
          error={message}
          categories={categories}
          onCancel={() => setEditing(null)}
          onChange={setEditing}
          onSave={() => save.mutate(editing)}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-neutral-500">
              {isLoading
                ? "Loading…"
                : `${visibleProducts.length} of ${products.length} products`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, slug, category…"
                aria-label="Search products"
                className="w-full border border-neutral-300 px-2.5 py-1.5 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none sm:w-56"
              />
              <Select
                value={sort}
                onValueChange={(value) => setSort(value as ProductSort)}
              >
                <SelectTrigger
                  aria-label="Sort products"
                  className="w-auto border-neutral-300 bg-white px-2.5 text-sm text-neutral-700 hover:text-neutral-900"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => openEditor(null)}
                className="bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
              >
                New product
              </button>
            </div>
          </div>
          {message && (
            <p className="mt-2 text-sm text-neutral-600">{message}</p>
          )}
          <div className="mt-3 border border-neutral-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[38rem] text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs tracking-wide text-neutral-500 uppercase">
                    <th className="px-4 py-2">Product</th>
                    <th className="px-4 py-2">Category</th>
                    <th className="px-4 py-2 text-right">Variants</th>
                    <th className="px-4 py-2 text-right">From</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((p) => (
                    <tr
                      key={p.id}
                      className={`border-b border-neutral-100 text-neutral-800 last:border-0 ${p.archived ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          {p.image_url ? (
                            <img
                              src={p.image_url}
                              alt=""
                              className="h-9 w-9 border border-neutral-200 object-cover"
                            />
                          ) : (
                            <span className="flex h-9 w-9 items-center justify-center bg-neutral-100 text-xs text-neutral-400">
                              {p.name.charAt(0)}
                            </span>
                          )}
                          <span>
                            <span className="block font-medium">{p.name}</span>
                            <span className="block font-mono text-xs text-neutral-400">
                              {p.slug}
                              {p.archived && " · archived"}
                              {p.archived &&
                                p.order_count > 0 &&
                                ` · ${p.order_count} order${p.order_count === 1 ? "" : "s"}`}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-neutral-600">
                        {p.category || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {p.variant_count}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {formatPaise(p.min_price_paise)}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEditor(p.id)}
                          className="border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50"
                        >
                          Edit
                        </button>
                        {!p.archived && (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Archive "${p.name}"? It disappears from the store; past orders keep their snapshots.`
                                )
                              )
                                archive.mutate(p.id);
                            }}
                            className="ml-1.5 border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            Archive
                          </button>
                        )}
                        {p.archived && p.order_count === 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Permanently delete "${p.name}"? The slug "${p.slug}" becomes reusable. This cannot be undone.`
                                )
                              )
                                permanentDelete.mutate(p.id);
                            }}
                            className="ml-1.5 border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!isLoading && visibleProducts.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-neutral-500">
                No products match "{search}".
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

type AdminProductRow2 = {
  id: number;
  slug?: string;
  size_label?: string;
  unit?: string;
  price_paise: number;
  is_available: boolean;
  archived?: boolean;
};

function ProductEditorForm({
  product,
  busy,
  error,
  categories,
  onCancel,
  onChange,
  onSave,
}: {
  product: EditableProduct;
  busy: boolean;
  error: string;
  categories: string[];
  onCancel: () => void;
  onChange: (p: EditableProduct) => void;
  onSave: () => void;
}) {
  const set = (patch: Partial<EditableProduct>) =>
    onChange({ ...product, ...patch });
  const setVariant = (i: number, patch: Partial<AdminVariantRow>) => {
    const variants = product.variants.map((v, idx) =>
      idx === i ? { ...v, ...patch } : v
    );
    set({ variants });
  };

  const canSave =
    product.name.trim().length > 1 &&
    product.variants.some(
      (v) => Number(v.price_rupees.replace(/[^\d.]/g, "")) > 0
    );

  return (
    <form
      className="mx-auto max-w-3xl space-y-5 border border-neutral-200 bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-neutral-900">
          {product.id ? `Edit: ${product.name}` : "New product"}
        </h2>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !canSave}
            className="bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save product"}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-neutral-600">Name *</span>
          <input
            value={product.name}
            onChange={(e) => set({ name: e.target.value })}
            required
            className="w-full border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-neutral-600">
            Slug (URL, auto from name)
          </span>
          <input
            value={product.slug}
            onChange={(e) => set({ slug: e.target.value })}
            placeholder="auto"
            className="w-full border border-neutral-300 px-3 py-2 font-mono text-xs"
          />
        </label>
        <div className="text-sm">
          <span className="mb-1 block text-neutral-600">Category</span>
          <CategoryCombobox
            value={product.category}
            categories={categories}
            onChange={(next) => set({ category: next })}
          />
        </div>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-neutral-600">Description</span>
        <textarea
          value={product.description}
          onChange={(e) => set({ description: e.target.value })}
          rows={3}
          className="w-full border border-neutral-300 px-3 py-2"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="text-sm">
          <span className="mb-1 block text-neutral-600">
            Image (uploads to Cloudflare R2)
          </span>
          <ImageUpload
            value={product.image_url}
            onChange={(url) => set({ image_url: url })}
          />
        </div>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-neutral-600">
              Ingredients (comma separated)
            </span>
            <input
              value={product.ingredients}
              onChange={(e) => set({ ingredients: e.target.value })}
              className="w-full border border-neutral-300 px-3 py-2"
              placeholder="Sprouted ragi, Jaggery, Milk"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-neutral-600">
              Tags (comma separated)
            </span>
            <input
              value={product.tags}
              onChange={(e) => set({ tags: e.target.value })}
              className="w-full border border-neutral-300 px-3 py-2"
              placeholder="High-Protein, Fresh"
            />
          </label>
        </div>
      </div>

      <fieldset className="border border-neutral-200 p-4">
        <legend className="px-2 text-sm font-medium text-neutral-700">
          Nutrition (per serving)
        </legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {(
            [
              ["calories", "Calories"],
              ["protein", "Protein"],
              ["carbs", "Carbs"],
              ["fat", "Fat"],
              ["fiber", "Fiber"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-xs">
              <span className="mb-1 block text-neutral-500">{label}</span>
              <input
                value={product[key]}
                onChange={(e) => set({ [key]: e.target.value })}
                placeholder={key === "calories" ? "120" : "3g"}
                className="w-full border border-neutral-300 px-2 py-1.5"
              />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="border border-neutral-200 p-4">
        <legend className="px-2 text-sm font-medium text-neutral-700">
          Sizes & prices (what customers order)
        </legend>
        <div className="space-y-2">
          {product.variants.map((v, i) => (
            <div
              key={v.id ?? `new-${i}`}
              className="flex flex-wrap items-end gap-2"
            >
              <label className="text-xs">
                <span className="mb-1 block text-neutral-500">Size label</span>
                <input
                  value={v.size_label}
                  onChange={(e) =>
                    setVariant(i, { size_label: e.target.value })
                  }
                  placeholder="Small"
                  className="w-24 border border-neutral-300 px-2 py-1.5"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-neutral-500">Unit</span>
                <input
                  value={v.unit}
                  onChange={(e) => setVariant(i, { unit: e.target.value })}
                  placeholder="200ml"
                  className="w-20 border border-neutral-300 px-2 py-1.5"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-neutral-500">Price ₹ *</span>
                <input
                  value={v.price_rupees}
                  onChange={(e) =>
                    setVariant(i, { price_rupees: e.target.value })
                  }
                  inputMode="decimal"
                  placeholder="40"
                  className="w-20 border border-neutral-300 px-2 py-1.5"
                  required
                />
              </label>
              <label className="flex items-center gap-1.5 pb-2 text-xs text-neutral-600">
                <input
                  type="checkbox"
                  checked={v.is_available}
                  onChange={(e) =>
                    setVariant(i, { is_available: e.target.checked })
                  }
                />
                available
              </label>
              {product.variants.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    set({
                      variants: product.variants.filter((_, idx) => idx !== i),
                    })
                  }
                  className="mb-1.5 border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            set({
              variants: [
                ...product.variants,
                {
                  size_label: "",
                  unit: "",
                  price_rupees: "",
                  is_available: true,
                },
              ],
            })
          }
          className="mt-3 border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50"
        >
          + Add size
        </button>
        <p className="mt-2 text-xs text-neutral-400">
          Removing a size here archives it — orders already placed keep their
          prices.
        </p>
      </fieldset>

      <div className="flex gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={product.is_featured}
            onChange={(e) => set({ is_featured: e.target.checked })}
          />
          Featured on the homepage
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={product.is_available}
            onChange={(e) => set({ is_available: e.target.checked })}
          />
          Visible in the store
        </label>
      </div>
    </form>
  );
}

// ---- Localities ----

function LocalitiesTab() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-localities"],
    queryFn: () => adminApi.localities(),
  });
  const [dialog, setDialog] = useState<"new" | LocalityRow | null>(null);
  const toggle = useMutation({
    mutationFn: (l: LocalityRow) =>
      adminApi.updateLocality(l.id, {
        name: l.name,
        city: l.city,
        is_active: !l.is_active,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-localities"] }),
  });

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-neutral-500">
          Delivery zones — customers inside a zone are auto-assigned to it at
          checkout.
        </p>
        <button
          type="button"
          onClick={() => setDialog("new")}
          className="shrink-0 bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800"
        >
          + Add locality
        </button>
      </div>
      <div className="mt-3 overflow-x-auto border border-neutral-200 bg-white">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-2 font-medium">Locality</th>
              <th className="px-4 py-2 font-medium">City</th>
              <th className="px-4 py-2 font-medium">Zones</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {(data?.localities ?? []).map((l) => (
              <tr key={l.id} className={l.is_active ? "" : "text-neutral-400"}>
                <td className="px-4 py-2.5">
                  {l.name}
                  {!l.is_active && (
                    <span className="ml-2 text-xs">(inactive)</span>
                  )}
                </td>
                <td className="px-4 py-2.5">{l.city}</td>
                <td className="px-4 py-2.5">
                  {l.perimeters.length === 0 ? (
                    <span className="text-xs text-amber-600">
                      no zones drawn
                    </span>
                  ) : (
                    `${l.perimeters.length} zone${l.perimeters.length > 1 ? "s" : ""}`
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setDialog(l)}
                      className="border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle.mutate(l)}
                      disabled={toggle.isPending}
                      className={`border px-2 py-1 text-xs ${
                        l.is_active
                          ? "border-neutral-300 hover:bg-neutral-50"
                          : "border-green-300 text-green-700 hover:bg-green-50"
                      }`}
                    >
                      {l.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {toggle.isError && (
        <p className="mt-2 text-sm text-red-600">
          {toggle.error instanceof Error
            ? toggle.error.message
            : "Failed to update locality"}
        </p>
      )}
      {dialog && (
        <LocalityDialog
          key={dialog === "new" ? "new" : dialog.id}
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null);
          }}
          target={dialog}
          localities={data?.localities ?? []}
        />
      )}
    </div>
  );
}

// ---- Partners ----

function PartnersTab() {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const { data } = useQuery({
    queryKey: ["admin-partners"],
    queryFn: () => adminApi.partners(),
  });
  const create = useMutation({
    mutationFn: () =>
      adminApi.createPartner({ phone: `+91${phone.replace(/\D/g, "")}`, name }),
    onSuccess: () => {
      setPhone("");
      setName("");
      queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
    },
  });
  const toggle = useMutation({
    mutationFn: (p: PartnerRow) =>
      adminApi.updatePartner(p.partner_id, { is_active: !p.is_active }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-partners"] }),
  });

  return (
    <div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (phone.replace(/\D/g, "").length === 10) create.mutate();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          aria-label="Partner name"
          className="w-40 border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="10-digit phone"
          aria-label="Partner phone"
          className="w-40 border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="bg-neutral-900 px-3 py-1.5 text-sm text-white"
          disabled={create.isPending}
        >
          Provision partner
        </button>
      </form>
      <div className="mt-3 border border-neutral-200 bg-white">
        <ul className="divide-y divide-neutral-100">
          {(data?.partners ?? []).map((p) => (
            <li
              key={p.partner_id}
              className="flex items-center justify-between px-4 py-2.5 text-sm"
            >
              <span>
                {p.name || "—"}{" "}
                <span className="text-neutral-400">{p.phone}</span>
              </span>
              <button
                type="button"
                onClick={() => toggle.mutate(p)}
                className={`border px-2 py-1 text-xs ${p.is_active ? "border-neutral-300 hover:bg-neutral-50" : "border-green-300 text-green-700 hover:bg-green-50"}`}
              >
                {p.is_active ? "Deactivate" : "Activate"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---- Admins ----

function AdminsTab() {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("operations_admin");
  const { data } = useQuery({
    queryKey: ["admin-admins"],
    queryFn: () => adminApi.admins(),
  });
  const create = useMutation({
    mutationFn: () =>
      adminApi.createAdmin({
        phone: `+91${phone.replace(/\D/g, "")}`,
        name,
        role,
      }),
    onSuccess: () => {
      setPhone("");
      setName("");
      queryClient.invalidateQueries({ queryKey: ["admin-admins"] });
    },
  });
  const toggle = useMutation({
    mutationFn: (a: AdminRow) =>
      adminApi.updateAdmin(a.admin_id, { is_active: !a.is_active }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-admins"] }),
  });

  return (
    <div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (phone.replace(/\D/g, "").length === 10) create.mutate();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          aria-label="Admin name"
          className="w-40 border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="10-digit phone"
          aria-label="Admin phone"
          className="w-40 border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="Admin role"
          className="border border-neutral-300 px-2 py-1.5 text-sm"
        >
          <option value="operations_admin">operations_admin</option>
          <option value="super_admin">super_admin</option>
        </select>
        <button
          type="submit"
          className="bg-neutral-900 px-3 py-1.5 text-sm text-white"
          disabled={create.isPending}
        >
          Provision admin
        </button>
      </form>
      <div className="mt-3 border border-neutral-200 bg-white">
        <ul className="divide-y divide-neutral-100">
          {(data?.admins ?? []).map((a) => (
            <li
              key={a.admin_id}
              className="flex items-center justify-between px-4 py-2.5 text-sm"
            >
              <span>
                {a.name || "—"}{" "}
                <span className="text-neutral-400">{a.phone}</span>{" "}
                <span className="ml-1 bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                  {a.role}
                </span>
              </span>
              <button
                type="button"
                onClick={() => toggle.mutate(a)}
                className={`border px-2 py-1 text-xs ${a.is_active ? "border-neutral-300 hover:bg-neutral-50" : "border-green-300 text-green-700 hover:bg-green-50"}`}
              >
                {a.is_active ? "Deactivate" : "Activate"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---- Settings ----

function SettingsTab() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => adminApi.settings(),
  });
  const [cutoff, setCutoff] = useState<string | null>(null);
  const [tracking, setTracking] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");

  const save = useMutation({
    mutationFn: () =>
      adminApi.updateSettings({
        ...(cutoff !== null ? { cutoff_minutes: Number(cutoff) } : {}),
        ...(tracking !== null ? { tracking_enabled: tracking } : {}),
      }),
    onSuccess: () => {
      setMessage(
        "Saved. New batches use the updated policy; existing orders are unchanged."
      );
      setCutoff(null);
      setTracking(null);
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e) => setMessage(e.message),
  });

  if (!data) return <p className="text-sm text-neutral-500">Loading…</p>;

  const minutesToHHMM = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  return (
    <div className="max-w-md border border-neutral-200 bg-white p-5">
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-neutral-500">Cutoff</dt>
          <dd className="font-medium">
            {minutesToHHMM(data.cutoff_minutes)} ({data.business_timezone})
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-500">Delivery window</dt>
          <dd className="font-medium">
            {data.delivery_window_start} – {data.delivery_window_end}
          </dd>
        </div>
      </dl>

      <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4">
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-600">
            Change cutoff (minutes after midnight)
          </span>
          <input
            type="number"
            min={0}
            max={1439}
            value={cutoff ?? data.cutoff_minutes}
            onChange={(e) => setCutoff(e.target.value)}
            className="w-32 border border-neutral-300 px-2 py-1.5"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={tracking ?? data.tracking_enabled}
            onChange={(e) => setTracking(e.target.checked)}
          />
          <span className="text-neutral-600">GPS tracking enabled</span>
        </label>
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending || (cutoff === null && tracking === null)}
          className="bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Save settings
        </button>
        {message && <p className="text-sm text-neutral-600">{message}</p>}
      </div>
    </div>
  );
}
