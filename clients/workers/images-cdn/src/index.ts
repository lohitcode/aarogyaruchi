export interface Env {
  R2_BUCKET: R2Bucket;
  /** Shared with the Go API (R2_UPLOAD_SECRET); authorizes /upload. */
  UPLOAD_SECRET?: string;
  /** Comma-separated browser origins allowed to upload (admin panel). */
  UPLOAD_ALLOWED_ORIGINS?: string;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

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

async function handleUpload(request: Request, env: Env): Promise<Response> {
  const secret = env.UPLOAD_SECRET;
  if (!secret) return new Response("Uploads disabled", { status: 503 });

  const url = new URL(request.url);
  const exp = Number(url.searchParams.get("exp") ?? "");
  const sig = url.searchParams.get("sig") ?? "";
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
    return new Response("Upload URL expired", { status: 401 });
  }

  // Signature matches the Go API: hex(HMAC-SHA256(secret, "upload:" + exp)).
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
    new TextEncoder().encode("upload:" + exp),
  );
  const expected = hex(signature);
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

  const size = Number(request.headers.get("content-length") ?? "0");
  if (size <= 0 || size > MAX_UPLOAD_BYTES) {
    return new Response("Image must be between 1 byte and 10 MB", { status: 413 });
  }

  const key = "products/" + crypto.randomUUID() + "." + ext;
  await env.R2_BUCKET.put(key, request.body, {
    httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
  });

  return Response.json({ url: url.origin + "/" + key, key });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origins = (env.UPLOAD_ALLOWED_ORIGINS ??
      "https://aarogyaruchi.com,https://www.aarogyaruchi.com,http://localhost:3000")
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
