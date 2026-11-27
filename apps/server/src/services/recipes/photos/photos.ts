import { randomBytes } from "node:crypto"
import sharp from "sharp"
import { AppError } from "../../../core/errors.ts"
import type { FileStore } from "../../storage/files.ts"

/**
 * Each photo is kept in three sizes: big enough for the recipe page, cropped
 * for recipe cards, and a small square for tiles. Phone photos are often 5 to
 * 10 MB; these are a few hundred KB, and the thumbnail a few KB.
 */
export const PHOTO_SIZES = {
  full: { width: 1600, height: 1600, fit: "inside", quality: 80 },
  card: { width: 800, height: 600, fit: "cover", quality: 75 },
  thumb: { width: 160, height: 160, fit: "cover", quality: 70 },
} as const

export type PhotoSize = keyof typeof PHOTO_SIZES

/** The largest photo that can be added. */
export const MAX_PHOTO_BYTES = 15_000_000

export const photoFolder = (householdId: string, photoId: string) =>
  `photos/${householdId}/${photoId}`

/** Where a recipe's photo is shown from. The photo id in it changes with the photo, so it can be kept for good. */
export function photoUrls(recipe: { id: string; image?: string | null }) {
  if (!recipe.image) return null
  const url = (size: PhotoSize) =>
    `/api/recipes/${recipe.id}/photo?size=${size}&v=${recipe.image}`
  return { full: url("full"), card: url("card"), thumb: url("thumb") }
}

/**
 * Keeps a photo, in each size, as WebP, turned the right way up. Returns
 * its id, for the recipe to hold.
 */
export async function storePhoto(
  files: FileStore,
  householdId: string,
  input: Buffer
): Promise<string> {
  let image: ReturnType<typeof sharp>
  try {
    image = sharp(input, { failOn: "error" }).rotate()
    const { width = 0, height = 0 } = await image.metadata()
    if (!width || !height) throw new Error("No size")
  } catch {
    throw new AppError(
      "invalid",
      "not_an_image",
      "That file isn't a photo Merran can read."
    )
  }

  const photoId = randomBytes(12).toString("hex")
  for (const [size, { width, height, fit, quality }] of Object.entries(
    PHOTO_SIZES
  )) {
    const body = await image
      .clone()
      .resize({ width, height, fit, withoutEnlargement: fit === "inside" })
      .webp({ quality })
      .toBuffer()
    await files.put(`${photoFolder(householdId, photoId)}/${size}.webp`, body)
  }
  return photoId
}

export async function readPhoto(
  files: FileStore,
  householdId: string,
  photoId: string,
  size: PhotoSize
) {
  const key = `${photoFolder(householdId, photoId)}/${size}.webp`
  const kept = await files.read(key)
  // An empty thumbnail is a broken one (cut short before writes were
  // atomic): make it again.
  if (size !== "thumb" ? kept : kept && kept.length > 0) return kept

  // A photo kept before thumbnails existed has none. Make it from the full
  // photo the first time it's asked for, and keep it for the next.
  const full = await files.read(
    `${photoFolder(householdId, photoId)}/full.webp`
  )
  if (!full) return null
  const { width, height, fit, quality } = PHOTO_SIZES.thumb
  const thumb = await sharp(full)
    .resize({ width, height, fit })
    .webp({ quality })
    .toBuffer()
  await files.put(key, thumb)
  return thumb
}

/** Deletes a photo in every size. A photo that's already gone is fine. */
export async function removePhoto(
  files: FileStore,
  householdId: string,
  photoId: string | null | undefined
) {
  if (photoId) await files.remove(photoFolder(householdId, photoId))
}
