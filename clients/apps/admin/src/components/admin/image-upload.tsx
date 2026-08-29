import { useRef, useState } from "react"
import { ImagePlus, Trash2, Upload } from "lucide-react"
import { api } from "../../lib/api"

/**
 * Product image upload: the Go API mints a short-lived HMAC token, the
 * browser streams the file straight to the images-cdn worker, which stores
 * it in the R2 bucket. The returned CDN URL is what gets saved on the
 * product.
 *
 * The token also carries an og_upload_url for the link-preview variant — a
 * canvas-resized ~90 KB JPEG (WhatsApp drops preview images over ~300 KB)
 * stored by the worker next to the original at <stem>.og.jpg, which keeps
 * the variant URL derivable for the API's preview-metadata sync.
 */

const OG_MAX_EDGE = 800
const OG_JPEG_QUALITY = 0.72

async function ogVariantBlob(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, OG_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", OG_JPEG_QUALITY),
    )
  } catch {
    return null
  }
}

export function ImageUpload({
  value,
  onChange,
}: {
  value: string
  onChange: (url: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const upload = async (file: File) => {
    if (busy) return
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file (PNG, JPG, WebP, or GIF).")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Images must be under 10 MB.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const token = await api.post<{
        upload_url: string
        og_upload_url?: string
      }>("/v1/admin/uploads/image")
      const res = await fetch(token.upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `upload failed (${res.status})`)
      }
      const body = (await res.json()) as { url: string }
      onChange(body.url)

      // Best-effort link-preview variant; failure only means the preview
      // card serves the original image (or none) until a re-upload.
      if (token.og_upload_url) {
        const blob = await ogVariantBlob(file)
        if (blob) {
          await fetch(token.og_upload_url, {
            method: "PUT",
            headers: { "Content-Type": "image/jpeg" },
            body: blob,
          })
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-start gap-3">
          <img
            src={value}
            alt="Product"
            className="h-24 w-24 border border-neutral-200 object-cover"
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="flex items-center gap-1 border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3 w-3" />
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex h-24 w-24 flex-col items-center justify-center gap-1 border border-dashed border-neutral-300 text-neutral-400 hover:border-neutral-500 hover:text-neutral-600 disabled:opacity-50"
        >
          <ImagePlus className="h-6 w-6" />
          <span className="text-[10px]">{busy ? "Uploading…" : "Add image"}</span>
        </button>
      )}
      {value && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-1.5 border border-neutral-300 px-2.5 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          {busy ? "Uploading…" : "Replace image"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        aria-label="Product image file"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) upload(file)
        }}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
