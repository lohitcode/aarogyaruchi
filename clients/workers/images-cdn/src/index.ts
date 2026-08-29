export interface Env {
  R2_BUCKET: R2Bucket;
  /** Shared with the Go API (R2_UPLOAD_SECRET); authorizes /upload and /og/*. */
  UPLOAD_SECRET?: string;
  /** Comma-separated browser origins allowed to upload (admin panel). */
  UPLOAD_ALLOWED_ORIGINS?: string;
  /** Link-preview (Open Graph) metadata store, key = product slug. The Go API
   * writes it after every product mutation; the site worker reads it for SSR
   * meta tags. Bound so the VPS never needs a Cloudflare API credential. */
  OG_CATALOG?: KVNamespace;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_OG_VALUE_BYTES = 8 * 1024;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function applyCors(response: Response, origins: string[], requestOrigin: string | null): Response {
  if (requestOrigin && origins.indexOf(requestOrigin) !== -1) {
    response.headers.set("Access-Control-Allow-Origin", requestOrigin);
    response.headers.set("Vary", "Origin");
  }
  return response;
}

function hex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

async function hmacHex(secret: string, material: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    keyMaterial,
    new TextEncoder().encode(material),
  );
  return hex(signature);
}

function expired(url: URL): boolean {
  const exp = Number(url.searchParams.get("exp") ?? "");
  return !Number.isFinite(exp) || exp * 1000 < Date.now();
}

async function handleUpload(request: Request, env: Env): Promise<Response> {
  const secret = env.UPLOAD_SECRET;
  if (!secret) return new Response("Uploads disabled", { status: 503 });

  const url = new URL(request.url);
  if (expired(url)) {
    return new Response("Upload URL expired", { status: 401 });
  }

  // Signature matches the Go API: hex(HMAC-SHA256(secret, "upload:" + exp)).
  const expected = await hmacHex(secret, "upload:" + url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  if (sig.length !== expected.length || sig !== expected) {
    return new Response("Invalid upload signature", { status: 403 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  const ext = EXT_BY_TYPE[contentType];
  if (!ext) {
    return new Response("content-type must be image/png, jpeg, webp, or gif", {
      status: 415,
    });
  }

  // Optional deterministic key stem (a UUID minted by the Go API) so a
  // product's original and its link-preview variant share one key stem:
  // products/<stem>.<ext> and products/<stem>.og.jpg — the og URL stays
  // derivable from the original everywhere downstream. Unstemed uploads keep
  // the legacy random-UUID key.
  const stem = url.searchParams.get("stem");
  const isOgVariant = url.searchParams.get("v") === "og";
  if (stem !== null && !UUID_RE.test(stem)) {
    return new Response("Invalid stem", { status: 400 });
  }
  if (isOgVariant) {
    // Link previews are always canvas-resized JPEGs; forcing the extension
    // keeps the <stem>.og.jpg derivation exact.
    if (contentType !== "image/jpeg") {
      return new Response("OG variant must be image/jpeg", { status: 415 });
    }
    if (stem === null) {
      return new Response("OG variant requires stem", { status: 400 });
    }
  }

  const size = Number(request.headers.get("content-length") ?? "0");
  if (size <= 0 || size > MAX_UPLOAD_BYTES) {
    return new Response("Image must be between 1 byte and 10 MB", { status: 413 });
  }

  const key = stem
    ? `products/${stem}.${isOgVariant ? "og.jpg" : ext}`
    : "products/" + crypto.randomUUID() + "." + ext;
  await env.R2_BUCKET.put(key, request.body, {
    httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
  });

  return Response.json({ url: url.origin + "/" + key, key });
}

// The Go API's post-commit hook (and the seed script) upsert/delete the
// link-preview metadata for one product slug. Auth material includes the slug
// so a leaked URL is scoped to a single key and expires like upload tokens:
// hex(HMAC-SHA256(secret, "ogsync:" + slug + ":" + exp)).
async function handleOgSync(
  request: Request,
  env: Env,
  slug: string,
): Promise<Response> {
  if (!env.UPLOAD_SECRET) return new Response("Uploads disabled", { status: 503 });
  if (!env.OG_CATALOG) return new Response("OG catalog disabled", { status: 503 });
  if (!SLUG_RE.test(slug)) return new Response("Invalid slug", { status: 400 });

  const url = new URL(request.url);
  if (expired(url)) {
    return new Response("Sync URL expired", { status: 401 });
  }
  const expected = await hmacHex(
    env.UPLOAD_SECRET,
    `ogsync:${slug}:${url.searchParams.get("exp")}`,
  );
  const sig = url.searchParams.get("sig") ?? "";
  if (sig.length !== expected.length || sig !== expected) {
    return new Response("Invalid sync signature", { status: 403 });
  }

  if (request.method === "DELETE") {
    await env.OG_CATALOG.delete(slug);
    return Response.json({ slug, deleted: true });
  }
  if (request.method !== "PUT") {
    return new Response("Method not allowed", { status: 405 });
  }

  const value = await request.text();
  if (value.length === 0 || value.length > MAX_OG_VALUE_BYTES) {
    return new Response(`Value must be between 1 byte and ${MAX_OG_VALUE_BYTES} bytes`, {
      status: 413,
    });
  }
  try {
    JSON.parse(value);
  } catch {
    return new Response("Value must be JSON", { status: 400 });
  }
  await env.OG_CATALOG.put(slug, value);
  return Response.json({ slug, stored: value.length });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origins = (env.UPLOAD_ALLOWED_ORIGINS ??
      "https://aarogyaruchi.com,https://www.aarogyaruchi.com,https://admin.aarogyaruchi.com,https://dev-admin.aarogyaruchi.com,http://localhost:3000,http://localhost:3001")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

    // Authenticated product-image upload from the admin panel. The Go API
    // mints the exp/sig token; bytes stream straight into R2.
    if (url.pathname === "/upload") {
      const origin = request.headers.get("Origin");
      if (request.method === "OPTIONS") {
        const preflight = applyCors(new Response(null, { status: 204 }), origins, origin);
        preflight.headers.set("Access-Control-Allow-Methods", "PUT, OPTIONS");
        preflight.headers.set("Access-Control-Allow-Headers", "Content-Type");
        return preflight;
      }
      if (request.method !== "PUT") {
        return applyCors(new Response("Method not allowed", { status: 405 }), origins, origin);
      }
      return applyCors(await handleUpload(request, env), origins, origin);
    }

    // Server-to-server link-preview metadata sync (Go post-commit hook, seed
    // script). No CORS — browsers never call this.
    if (url.pathname.startsWith("/og/")) {
      return handleOgSync(request, env, url.pathname.slice("/og/".length));
    }

    const key = url.pathname.slice(1);
    if (!key) return new Response("Missing key", { status: 400 });

    const object = await env.R2_BUCKET.get(key);
    if (!object) return new Response("Not Found", { status: 404 });

    const headers = new Headers();
    headers.set("Content-Type", object.httpMetadata?.contentType || "image/png");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    return new Response(object.body, { headers });
  },
};
