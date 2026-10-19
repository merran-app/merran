import { photoPrompt } from "./prompts.ts"
import type { EntityManager } from "@mikro-orm/sql"
import type { AppDeps } from "../../../core/context.ts"
import { AppError } from "../../../core/errors.ts"
import { Recipe } from "../../../database/entities/index.ts"
import { PHOTOS } from "../../../modules/photos/settings.ts"
import { targetOf } from "../../ai/keys.ts"
import { canMakeImages, IMAGE_MODELS } from "../../ai/media.ts"
import { keyFrom } from "../../ai/status.ts"
import { recordUsage } from "../../ai/usage.ts"
import { removePhoto, storePhoto } from "./photos.ts"
import { findRecipe, loadRecipe } from "../recipes.ts"

// AI photos: a photo for a recipe without one, made by a household's
// OpenAI or Google key, in the household's style so the library looks like
// one cookbook. Marked as made by AI, and never in place of a real photo.

export type PhotoDeps = Pick<
  AppDeps,
  "settings" | "fetcher" | "media" | "files"
>

/** About what a photo costs, for the monthly limits: the dearer provider's. */
const ESTIMATE = Math.max(
  ...Object.values(IMAGE_MODELS).map((model) => model.perImage)
)

/**
 * The key that makes a household's photos: an OpenAI or Google key from
 * whoever pays for its importing. Null when there's none, or no AI left
 * this month.
 */
export async function photoKeyFor(
  deps: PhotoDeps,
  em: EntityManager,
  householdId: string
) {
  const key = await keyFrom(deps, em, {
    householdId,
    task: "import",
    providers: ["openai", "google"],
    estimate: ESTIMATE,
  })
  return key && canMakeImages(key.provider)
    ? { ...key, provider: key.provider }
    : null
}

/** Whether a household can have AI photos made, and why not. */
export async function aiPhotosFor(
  deps: PhotoDeps,
  em: EntityManager,
  householdId: string
): Promise<{ ok: true } | { ok: false; why: "off" | "noKey" }> {
  if (!(await deps.settings.server(PHOTOS.enabled))) {
    return { ok: false, why: "off" }
  }
  if (!(await photoKeyFor(deps, em, householdId))) {
    return { ok: false, why: "noKey" }
  }
  return { ok: true }
}

const off = () =>
  new AppError(
    "unprocessable",
    "photos_off",
    "AI photos are off on this server. The server admin can turn them on in Settings, This server."
  )

const noKey = () =>
  new AppError(
    "unprocessable",
    "photos_no_key",
    "AI photos need an OpenAI or Google key. A household admin can add one in Settings, Household, AI."
  )

/**
 * Makes a photo for a recipe and keeps it: only for a recipe without a
 * photo, or with one made by AI, which it replaces. A real photo added
 * while it was being made stays.
 */
export async function makePhoto(
  deps: PhotoDeps,
  em: EntityManager,
  options: { householdId: string; userId: string | null; recipe: string }
) {
  if (!(await deps.settings.server(PHOTOS.enabled))) throw off()
  const recipe = await findRecipe(em, options.recipe)
  if (recipe.image && !recipe.imageByAi) {
    throw new AppError(
      "conflict",
      "has_photo",
      "That recipe has a photo already."
    )
  }
  const key = await photoKeyFor(deps, em, options.householdId)
  if (!key) throw noKey()

  await em.populate(recipe, ["ingredients", "steps"])
  const style = await deps.settings.household(
    em,
    options.householdId,
    PHOTOS.style
  )
  const { model, perImage } = IMAGE_MODELS[key.provider]
  const target = await targetOf(deps, em, key.id, model)
  let picture: Buffer
  try {
    picture = await deps.media.image(
      target,
      photoPrompt(
        {
          name: recipe.name,
          description: recipe.description,
          ingredients: recipe.ingredients.getItems(),
          steps: recipe.steps.getItems(),
        },
        style
      )
    )
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(
      "upstream",
      "photo_failed",
      "The photo couldn't be made. Try again in a moment."
    )
  }
  await recordUsage(em, {
    householdId: options.householdId,
    userId: options.userId,
    task: "import",
    provider: key.provider,
    model,
    source: key.source,
    keyId: key.id,
    inputTokens: 0,
    outputTokens: 0,
    cost: perImage,
  })
  await em.flush()

  const photoId = await storePhoto(deps.files, options.householdId, picture)
  // Read it again: a real photo may have come while this one was made.
  const fresh = em.fork()
  const now = await fresh.findOneOrFail(Recipe, { id: recipe.id })
  if (now.image && !now.imageByAi) {
    await removePhoto(deps.files, options.householdId, photoId)
    return loadRecipe(fresh, now.id)
  }
  const old = now.image
  now.image = photoId
  now.imageByAi = true
  await fresh.flush()
  await removePhoto(deps.files, options.householdId, old)
  return loadRecipe(fresh, now.id)
}
