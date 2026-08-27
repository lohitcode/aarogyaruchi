import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

/**
 * Client-side cart. Lines reference live API product ids so checkout quotes
 * and orders always use server-side prices; persistence is localStorage.
 */

export type CartLine = {
  variant_id: number
  slug: string
  name: string
  size_label?: string
  unit?: string
  price_paise: number
  quantity: number
}

type CartContextValue = {
  lines: CartLine[]
  count: number
  totalPaise: number
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void
  setQuantity: (productId: number, quantity: number) => void
  remove: (productId: number) => void
  clear: () => void
}

const STORAGE_KEY = "aarogya_ruchi_cart_v1"

const CartContext = createContext<CartContextValue | null>(null)

function load(): CartLine[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CartLine[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (l) => typeof l.variant_id === "number" && typeof l.quantity === "number",
    )
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([])

  // Hydrate after mount so SSR and first client render agree.
  useEffect(() => {
    setLines(load())
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
  }, [lines])

  const add = useCallback((line: Omit<CartLine, "quantity">, quantity = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.variant_id === line.variant_id)
      if (existing) {
        return prev.map((l) =>
          l.variant_id === line.variant_id
            ? { ...l, ...line, quantity: Math.min(50, l.quantity + quantity) }
            : l,
        )
      }
      return [...prev, { ...line, quantity }]
    })
  }, [])

  const setQuantity = useCallback((variantId: number, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.variant_id !== variantId)
        : prev.map((l) =>
            l.variant_id === variantId
              ? { ...l, quantity: Math.min(50, quantity) }
              : l,
          ),
    )
  }, [])

  const remove = useCallback((variantId: number) => {
    setLines((prev) => prev.filter((l) => l.variant_id !== variantId))
  }, [])

  const clear = useCallback(() => setLines([]), [])

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((sum, l) => sum + l.quantity, 0)
    const totalPaise = lines.reduce((sum, l) => sum + l.price_paise * l.quantity, 0)
    return { lines, count, totalPaise, add, setQuantity, remove, clear }
  }, [lines, add, setQuantity, remove, clear])

  return (
    <CartContext.Provider value={value}>{children}</CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider")
  }
  return ctx
}
