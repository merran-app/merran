import { parseVersion } from "@merran/shared/releases"
import type { Database } from "../env.ts"

const RELEASES =
  "https://api.github.com/repos/merran-app/merran/releases?per_page=100"

/**
 * Merran's releases: the newest from GitHub, added to those already known.
 * If GitHub can't be reached, the ones already known will do.
 */
export async function knownReleases(
  db: Database,
  fetcher: typeof fetch
): Promise<Set<string>> {
  try {
    const response = await fetcher(RELEASES, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "merran-telemetry (+https://merran.app)",
      },
    })
    if (response.ok) {
      const releases = (await response.json()) as { tag_name: string }[]
      const versions = releases
        .map((release) => release.tag_name.replace(/^v/, ""))
        .filter((version) => parseVersion(version) !== null)
      if (versions.length > 0) {
        await db.batch(
          versions.map((version) =>
            db
              .prepare(
                "INSERT INTO releases (version) VALUES (?) ON CONFLICT DO NOTHING"
              )
              .bind(version)
          )
        )
      }
    }
  } catch {
    // The releases already known will do.
  }
  const { results } = await db
    .prepare("SELECT version FROM releases")
    .all<{ version: string }>()
  return new Set(results.map((row) => row.version))
}
