// Rewrites the TanStack-generated dist/server/wrangler.json (which already
// resolves the "@tanstack/react-start/server-entry" main to a real file)
// into a dev-worker config: dev name, no prod custom-domain routes,
// workers.dev enabled. Written next to the generated config so relative
// paths (main: index.js, assets: ../client) keep resolving.
//
// Why not just `wrangler deploy -c wrangler.dev.jsonc` with the bare
// specifier? wrangler fails to resolve bare entry specifiers through -c
// even when the build output exists — only the default config path gets
// that treatment (verified wrangler 4.60).
import { readFileSync, writeFileSync } from "node:fs";

const generated = JSON.parse(readFileSync("dist/server/wrangler.json", "utf8"));
const dev = JSON.parse(readFileSync("wrangler.dev.jsonc", "utf8"));

generated.name = dev.name;
generated.topLevelName = dev.name;
// Dev custom domain (wrangler provisions the DNS + cert itself) instead of
// the prod custom-domain routes baked into the generated config.
generated.routes = dev.routes ?? [];
delete generated.configPath;
delete generated.userConfigPath;
generated.workers_dev = dev.workers_dev ?? true;
// Dev keeps no OG_CATALOG binding: the namespace holds the prod catalog's
// link-preview entries, and dev's build-time snapshot (built against
// dev-api) is the right fallback there.
delete generated.kv_namespaces;

writeFileSync("dist/server/wrangler.dev.json", JSON.stringify(generated, null, 2));
console.log(`wrote dist/server/wrangler.dev.json (worker: ${dev.name}, workers.dev on, no routes)`);
