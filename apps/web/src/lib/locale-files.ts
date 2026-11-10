// The app's locale files, as Vite's import.meta.glob finds them: a path
// for each, and a function that loads it. Adding a language is adding its
// file; nothing here names one.

/** The language a locale file is for, from its name: "./locales/pt-BR.json" is "pt-BR". */
export function codeFromPath(path: string): string | null {
  const name = path.split("/").pop() ?? ""
  return name.endsWith(".json") ? name.slice(0, -".json".length) : null
}

/**
 * A language's strings, loaded from its file, or null when there's no
 * file for it or it won't load (offline, say): the app stays in English
 * rather than failing.
 */
export async function loadLocale(
  code: string,
  loaders: Record<string, () => Promise<unknown>>
): Promise<Record<string, unknown> | null> {
  const path = Object.keys(loaders).find((each) => codeFromPath(each) === code)
  if (!path) return null
  try {
    const loaded = await loaders[path]!()
    const strings =
      loaded && typeof loaded === "object" && "default" in loaded
        ? loaded.default
        : loaded
    return strings && typeof strings === "object"
      ? (strings as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}
