// One-time backfill / manual force-resync of the link-preview (Open Graph)
// KV namespace: reads the live catalog, builds one entry per product slug,
// and bulk-puts them via `wrangler kv bulk put` (uses the Mac's wrangler
// OAuth login — no secrets involved).
//
// Day-to-day the Go API keeps entries fresh on every product mutation
// (server/internal/cfkv); this script exists to seed the namespace, to
// repair drift, and to backfill entries for products whose images predate
// the paired og-variant uploads.
//
// Image resolution order per product:
//   1. a committed public/og/<name>.jpg build asset (site-served, ~90 KB)
//   2. the derived CDN og variant  products/<stem>.og.jpg
//   3. the original CDN image (heavy; WhatsApp may drop it)
//
// Usage: cd clients/apps/user && node scripts/sync-og-kv.mjs

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const API_URL =
  process.env.OG_API_URL ??
  process.env.VITE_API_BASE_URL ??
  "https://api.aarogyaruchi.com";
const SITE_URL = "https://aarogyaruchi.com";
const NAMESPACE_ID =
  process.env.OG_KV_NAMESPACE_ID ?? "fa0f19e0df5c4dadbcfe9d44fade9f0b";
// Account ID is intentionally NOT hardcoded: this repo is public. Export
// CLOUDFLARE_ACCOUNT_ID (see clients/.env.example) before running.
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!ACCOUNT_ID) {
  console.error(
    "CLOUDFLARE_ACCOUNT_ID is not set — export it (clients/.env.example) and re-run."
  );
  process.exit(1);
}
const OG_ASSETS_DIR = path.join(appDir, "public", "og");

async function ogImageFor(product) {
  if (!product.image_url) return null;
  let parsed;
  try {
    parsed = new URL(product.image_url);
  } catch {
    return product.image_url;
  }
  // Build asset: public/og/<basename-without-ext>.jpg
  const stem = path
    .basename(parsed.pathname)
    .replace(/\.[^.]+$/, "");
  if (stem && existsSync(path.join(OG_ASSETS_DIR, `${stem}.jpg`))) {
    return `${SITE_URL}/og/${stem}.jpg`;
  }
  // Derived CDN og variant: products/<uuid>.<ext> -> products/<uuid>.og.jpg
  const key = parsed.pathname.slice(1);
  const [uuid, ext] = key.split("/").pop().split(".");
  if (
    parsed.pathname.startsWith("/products/") &&
    uuid &&
    ext &&
    /^[0-9a-f-]{36}$/i.test(uuid)
  ) {
    const candidate = `${parsed.origin}/products/${uuid}.og.jpg`;
    try {
      const head = await fetch(candidate, { method: "HEAD" });
      if (head.ok) return candidate;
    } catch {
      // fall through
    }
  }
  return product.image_url;
}

async function main() {
  const res = await fetch(`${API_URL}/v1/products`);
  if (!res.ok) throw new Error(`${API_URL}/v1/products -> ${res.status}`);
  const products = (await res.json()).products ?? [];
  if (products.length === 0) throw new Error("catalog is empty; refusing to wipe KV");

  const entries = [];
  for (const product of products) {
    if (!product.slug) continue;
    const minPricePaise = (product.variants ?? []).reduce(
      (min, v) => Math.min(min, v.price_paise ?? Number.MAX_SAFE_INTEGER),
      Number.MAX_SAFE_INTEGER,
    );
    entries.push({
      key: product.slug,
      value: JSON.stringify({
        name: product.name ?? product.slug,
        description: product.description ?? "",
        image: await ogImageFor(product),
        minPricePaise: Number.isFinite(minPricePaise) ? minPricePaise : 0,
        updatedAt: Math.floor(Date.now() / 1000),
      }),
    });
  }

  const bulkFile = path.join(tmpdir(), `og-kv-bulk-${Date.now()}.json`);
  await writeFile(bulkFile, JSON.stringify(entries));
  try {
    await run(
      "bunx",
      [
        "wrangler",
        "kv",
        "bulk",
        "put",
        bulkFile,
        "--namespace-id",
        NAMESPACE_ID,
        "--remote",
      ],
      { cwd: appDir, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID } },
    );
  } finally {
    await rm(bulkFile, { force: true });
  }
  console.log(`[og-kv] synced ${entries.length} entries into ${NAMESPACE_ID}`);
}

main().catch((err) => {
  console.error(`[og-kv] ${err.message}`);
  process.exit(1);
});
