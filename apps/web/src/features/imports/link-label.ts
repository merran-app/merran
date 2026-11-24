/** A link to show: its site and path, without the https://www. */
export function linkLabel(url: string) {
  try {
    const { hostname, pathname } = new URL(url)
    return `${hostname.replace(/^www\./, "")}${pathname === "/" ? "" : pathname}`
  } catch {
    return url
  }
}
