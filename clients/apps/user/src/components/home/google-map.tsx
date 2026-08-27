/**
 * Keyless Google Maps embed for our delivery area (Bachupally, Hyderabad).
 *
 * Compliance note: this uses Google's basic embed
 * (https://www.google.com/maps?q=...&output=embed), which does not require an
 * API key and is covered by Google's standard Terms of Service. If we later
 * switch to the Google Maps Embed API with a key, the key must be
 * HTTP-referrer-restricted and Google's attribution/ToS must be respected.
 */
export function StaticMapPreview() {
  const searchQuery = encodeURIComponent(
    "Bachupally, Hyderabad, Telangana"
  )
  const embedUrl = `https://www.google.com/maps?q=${searchQuery}&output=embed`

  return (
    <div className="relative h-[400px] w-full overflow-hidden rounded-2xl">
      <iframe
        src={embedUrl}
        width="100%"
        height="100%"
        style={{ border: 0 }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title="Aarogya Ruchi delivery area — Bachupally, Hyderabad"
      />
    </div>
  )
}
