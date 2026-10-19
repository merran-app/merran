/** WebAuthn needs HTTPS, with loopback origins allowed for local development. */
export function passkeyOrigin(publicUrl: string | undefined) {
  if (!publicUrl) return null
  const url = new URL(publicUrl)
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  return url.protocol === "https:" || (url.protocol === "http:" && loopback)
    ? url.origin
    : null
}
