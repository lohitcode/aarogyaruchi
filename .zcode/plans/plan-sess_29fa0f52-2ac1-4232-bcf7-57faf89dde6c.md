## Fix Cross-Browser Product Grid Rendering

**Root cause:** Framer Motion's `layout` prop conflicts with CSS Grid — no grid awareness in the projection system. The combination of `layout` on the grid container + `layout` on grid children + `AnimatePresence mode="popLayout"` causes cards to clip, overlap, and render differently in Chrome vs Safari.

### Changes to `clients/apps/user/src/components/products/product-grid.tsx`

1. **Remove `layout` from the grid container** — Change `<motion.div layout className="grid ...">` to a plain `<div className="grid ...">`. The grid container doesn't need layout animation; it's just a CSS grid wrapper.

2. **Remove `mode="popLayout"` from AnimatePresence** — Replace with `mode="sync"` which doesn't inject `position: absolute` and won't disrupt grid flow.

3. **Remove `scale` from exit animations** — Change `exit={{ opacity: 0, scale: 0.9 }}` to `exit={{ opacity: 0 }}`. The `scale: 0.9` exit interacts poorly with Framer Motion's projection system scale correction.

4. **Remove `scale` from initial animations** — Change `initial={{ opacity: 0, scale: 0.9 }}` to `initial={{ opacity: 0 }}` for the same reason.

5. **Keep `layout` only on individual grid items** — This is fine for simple fade transitions within grid cells; the problem was the combination with the parent.

### Final result for the grid:
```tsx
<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
  <AnimatePresence mode="sync">
    {filtered.map((product, i) => (
      <motion.div
        key={product.id}
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <ProductCard product={product} index={i} />
      </motion.div>
    ))}
  </AnimatePresence>
</div>
```

This preserves the filtering animation (items fade in/out when categories change) while eliminating all CSS Grid conflicts. The stagger animation on each card is already handled by `ProductCard`'s own `whileInView` animation with `delay: index * 0.1`.

**No changes needed** to `product-card.tsx`, `popular-products.tsx`, or any CSS files — the issue is isolated to `product-grid.tsx`.