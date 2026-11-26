import { randomBytes } from "node:crypto"
import type { AppDeps } from "../../../core/context.ts"
import { throwIfStopped } from "../../jobs/stop.ts"
import { smallPhoto } from "./sites/shelf.ts"

// The photos of what a search found. They're fetched as each recipe is saved
// and kept small on Merran, so Discover doesn't load pictures from other
// sites, and they go with the search when it's past the household's last
// twelve.

/** Where one found photo is kept. */
export const foundPhotoPath = (
  householdId: string,
  discoveryId: string,
  photoKey: string
) => `${searchFolder(householdId, discoveryId)}/${photoKey}.webp`

/** A search's photos' folder, which removing the search removes. */
export const searchFolder = (householdId: string, discoveryId: string) =>
  `discover/${householdId}/${discoveryId}`

/**
 * Fetches a found recipe's photo, small, and keeps it. Answers its path in
 * the API and its key, or null when there's no photo or it won't load.
 */
export async function keepFoundPhoto(
  deps: Pick<AppDeps, "fetcher" | "files">,
  place: { householdId: string; discoveryId: string },
  photoUrl: string | null,
  pageUrl: string
): Promise<{ photo: string; photoKey: string } | null> {
  if (!photoUrl) return null
  try {
    const body = await smallPhoto(deps.fetcher, photoUrl, pageUrl)
    const photoKey = randomBytes(12).toString("hex")
    await deps.files.put(
      foundPhotoPath(place.householdId, place.discoveryId, photoKey),
      body
    )
    return {
      photo: `/api/discover/${place.discoveryId}/photos/${photoKey}`,
      photoKey,
    }
  } catch {
    // A stopped job isn't a photo that won't load: the stop goes on.
    throwIfStopped()
    return null
  }
}
