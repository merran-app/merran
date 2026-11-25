import type { EntityManager } from "@mikro-orm/sql"
import type { Logger } from "pino"
import type { AppDeps } from "../../../core/context.ts"
import { AppError } from "../../../core/errors.ts"
import type {
  DiscoveredRecipe,
  Discovery,
} from "../../../database/entities/index.ts"
import { JobStopped, type JobContext } from "../../jobs/runner.ts"
import { decodeHtml } from "../import/import-link.ts"
import { findBySourceUrl, isVideoLink, normalizeLink } from "../import/links.ts"
import { readRecipeData } from "../import/recipe-data.ts"
import { sameDish } from "./dishes.ts"
import { keepFoundPhoto } from "./photos.ts"

// One round of a Discover search: the AI's picks, opened a few at a time,
// each recipe saved to the search with its photo as its page opens, so the
// search shows what it finds as it finds it. What the round has done is
// kept with its job as it goes, so a round cut off by a restart carries on
// from the picks it has, without asking the AI, or paying it, again.

/** The most recipes a round keeps, and from one site, unless there aren't others. */
const MOST = 8
const PER_SITE = 2

/** Fewer than this that open, and the AI is asked once more. */
const ENOUGH = 4

/** Pages opened at once. */
const AT_ONCE = 4

const NOTHING = "Nothing turned up that Merran could open. Try another theme."
const NOTHING_ELSE = "Nothing else turned up online that Merran could open."
const DIDNT_WORK = "The search didn't work. Try again in a moment."

/** A recipe page the AI picked, with a line on why it suits. */
export type AiPick = { url: string; name: string; why: string }

/** What a round keeps with its job as it goes, so a restart carries on. */
export type RoundSaved = {
  /** How many recipes the search had when the job began. */
  startedWith: number
  picks: AiPick[]
  /** The picks opened or given up on, by link. */
  tried: string[]
  /** The picks that didn't open as recipes, to tell the AI. */
  failed: string[]
  /** How many times the AI's been asked: 1 or 2. */
  asked: number
}

type RoundOptions = {
  householdId: string
  /** Dishes the household has in front of it, to find others than. */
  avoid: readonly string[]
  /** Asks the AI for picks, saying which links didn't open. */
  ask: (failed: string[]) => Promise<AiPick[]>
  /** What this round's job saved before a restart; null at first. */
  saved: RoundSaved | null
  progress: JobContext["progress"]
  signal: AbortSignal
  logger: Logger
}

type RoundDeps = Pick<AppDeps, "fetcher" | "files">

/** A page that opened as a recipe, before its photo is fetched. */
type Opened = Omit<DiscoveredRecipe, "photo" | "photoKey" | "shelfId"> & {
  photoUrl: string | null
}

/** What telling recipes apart needs of one. */
type Found = Pick<DiscoveredRecipe, "url" | "name" | "site">

/**
 * Runs one round on a search that's searching, saving each recipe as it
 * opens, and leaves the search done, stopped or failed. A stop for a
 * restart is thrown on with the search still searching, to carry on after.
 */
export async function runRound(
  deps: RoundDeps,
  em: EntityManager,
  discovery: Discovery,
  options: RoundOptions
): Promise<void> {
  await new Round(deps, em, discovery, options).run()
}

class Round {
  readonly #deps: RoundDeps
  readonly #em: EntityManager
  readonly #discovery: Discovery
  readonly #options: RoundOptions
  readonly #startedWith: number
  #picks: AiPick[]
  readonly #tried: string[]
  readonly #failed: string[]
  #asked: number
  /**
   * This round's recipes, counted from the moment each page opens: saved,
   * or on the way with its photo. Those saved before a restart count too.
   */
  readonly #ours: Found[]
  /** Recipes held back because their site has two already, in the order they opened. */
  readonly #held: Opened[] = []
  /** The last save, which the next waits for. */
  #saving: Promise<void> = Promise.resolve()

  constructor(
    deps: RoundDeps,
    em: EntityManager,
    discovery: Discovery,
    options: RoundOptions
  ) {
    this.#deps = deps
    this.#em = em
    this.#discovery = discovery
    this.#options = options
    const saved = options.saved
    this.#startedWith = saved?.startedWith ?? discovery.recipes.length
    this.#picks = saved?.picks ?? []
    this.#tried = [...(saved?.tried ?? [])]
    this.#failed = [...(saved?.failed ?? [])]
    this.#asked = saved?.asked ?? 0
    this.#ours = discovery.recipes.slice(this.#startedWith)
  }

  get #signal() {
    return this.#options.signal
  }

  get #full() {
    return this.#ours.length >= MOST
  }

  async run() {
    try {
      await this.#find()
    } catch (err) {
      await this.#endWith(err)
    }
  }

  async #find() {
    if (this.#asked === 0) await this.#ask([])
    await this.#openAll(this.#untried())

    // Too few opened: once more, saying which didn't.
    const opened = this.#ours.length + this.#held.length
    if (this.#asked === 1 && opened < ENOUGH && !this.#full) {
      await this.#ask([...this.#failed])
      await this.#openAll(this.#untried())
    }

    await this.#fillFromHeld()
    await this.#finish()
  }

  /** Asks the AI for picks, and keeps them with the job before opening any. */
  async #ask(failed: string[]) {
    const picks = await this.#options.ask(failed)
    this.#asked++
    for (const pick of picks) {
      // A link offered twice is opened once.
      if (!this.#picks.some((other) => other.url === pick.url)) {
        this.#picks = [...this.#picks, pick]
      }
    }
    await this.#tell()
  }

  #untried() {
    return this.#picks.filter((pick) => !this.#tried.includes(pick.url))
  }

  /**
   * Opens the picks, four at a time, the next starting as each finishes,
   * until the round has eight or it's stopped.
   */
  async #openAll(picks: AiPick[]) {
    await inPool(
      picks,
      AT_ONCE,
      () => !this.#full && !this.#signal.aborted,
      (pick) => this.#settle(pick)
    )
    // A stopped fetch is only a page that didn't open, to `open`: the stop
    // goes on from here.
    this.#signal.throwIfAborted()
  }

  /** Opens one pick and, if it's a recipe this round keeps, saves it. */
  async #settle(pick: AiPick) {
    const recipe = await open(this.#deps, this.#em, pick)
    // Stopped while it opened: nothing more is kept.
    if (this.#signal.aborted) return
    if (!recipe) {
      this.#failed.push(pick.url)
    } else if (this.#take(recipe) === "ours") {
      await this.#keep(recipe)
      if (this.#signal.aborted) return
    }
    this.#tried.push(pick.url)
    await this.#tell()
  }

  /**
   * Whether a recipe that's opened is this round's, held back until the
   * end, or left out. It's decided, and counted, the moment its page opens,
   * before anything is awaited, so two pages of one dish that open together
   * can't both get in while the other's photo is fetched.
   */
  #take(recipe: Opened): "ours" | "held" | "left out" {
    const have: Found[] = [
      ...this.#discovery.recipes,
      ...this.#ours,
      ...this.#held,
    ]
    const known = have.some(
      (other) => other.url === recipe.url || sameDish(other.name, recipe.name)
    )
    const avoided = this.#options.avoid.some((name) =>
      sameDish(name, recipe.name)
    )
    if (known || avoided || this.#full) return "left out"

    const fromSite = this.#ours.filter(
      (other) => other.site === recipe.site
    ).length
    if (fromSite >= PER_SITE) {
      this.#held.push(recipe)
      return "held"
    }
    this.#ours.push(recipe)
    return "ours"
  }

  /** Fetches a recipe's photo, kept small on Merran, and saves the recipe to the search. */
  async #keep(recipe: Opened) {
    const photo = await keepFoundPhoto(
      this.#deps,
      {
        householdId: this.#options.householdId,
        discoveryId: this.#discovery.id,
      },
      recipe.photoUrl,
      recipe.url
    )
    const found: DiscoveredRecipe = {
      url: recipe.url,
      name: recipe.name,
      site: recipe.site,
      minutes: recipe.minutes,
      photo: photo?.photo ?? null,
      photoKey: photo?.photoKey ?? null,
      why: recipe.why,
    }
    await this.#save(() => {
      // Stopped while it waited its turn: what's found ends with the stop.
      if (this.#signal.aborted) return
      this.#discovery.recipes = [...this.#discovery.recipes, found]
    })
  }

  /** The held-back recipes fill the round up to eight, in the order they opened. */
  async #fillFromHeld() {
    const room = Math.max(0, MOST - this.#ours.length)
    for (const recipe of this.#held.slice(0, room)) {
      this.#signal.throwIfAborted()
      this.#ours.push(recipe)
      await this.#keep(recipe)
    }
    this.#signal.throwIfAborted()
  }

  async #finish() {
    await this.#save(() => {
      if (this.#endIfStopped()) return
      const count = this.#discovery.recipes.length
      this.#discovery.status = "done"
      this.#discovery.progress = null
      if (count === 0) {
        this.#discovery.error = NOTHING
      } else if (count === this.#startedWith) {
        // What the shelf or an earlier round found is all there is.
        this.#discovery.error = NOTHING_ELSE
      } else {
        this.#discovery.error = null
      }
    })
  }

  /** How the round ends when something stops it, or goes wrong. */
  async #endWith(err: unknown) {
    // Merran is shutting down: the round carries on after the restart.
    if (shuttingDown(this.#signal)) throw this.#signal.reason
    if (wasCancelled(this.#signal)) {
      await this.#save(() => {
        this.#endIfStopped()
      })
      throw this.#signal.reason
    }
    await this.#save(() => {
      this.#discovery.status = "failed"
      this.#discovery.progress = null
      this.#discovery.error = err instanceof AppError ? err.message : DIDNT_WORK
    })
    if (!(err instanceof AppError)) {
      this.#options.logger.warn(
        { err, discovery: this.#discovery.id },
        "A search failed"
      )
    }
  }

  /**
   * Says how far the round's got: with its job, where a restart finds what
   * it's done, and on the search, for the page showing it.
   */
  async #tell() {
    const done = this.#tried.length
    const total = this.#picks.length
    await this.#options.progress(done, total, this.#soFar())
    await this.#save(() => {
      if (this.#endIfStopped()) return
      this.#discovery.progress = { done, total }
    })
  }

  /**
   * When someone has stopped the round, makes the change that ends the
   * search as stopped, keeping what it found, and says so. Each save of the
   * round asks first, so one made as the stop arrives can't leave the
   * search done, or still going, over a stop that's already saved.
   */
  #endIfStopped() {
    if (!wasCancelled(this.#signal)) return false
    this.#discovery.status = "stopped"
    this.#discovery.progress = null
    return true
  }

  /**
   * What the round has done, as a fresh copy: the job may hold it back to
   * save a moment later, by which time these lists have moved on.
   */
  #soFar(): RoundSaved {
    return {
      startedWith: this.#startedWith,
      picks: [...this.#picks],
      tried: [...this.#tried],
      failed: [...this.#failed],
      asked: this.#asked,
    }
  }

  /**
   * Makes a change to the search and saves it, after the save before it:
   * one entity manager can't flush twice at once.
   */
  #save(change: () => void): Promise<void> {
    const turn = this.#saving.then(async () => {
      change()
      await this.#em.flush()
    })
    // A save that fails is thrown to whoever asked for it, not to the next.
    this.#saving = turn.catch(() => {})
    return turn
  }
}

/** A pick that opens as a recipe page, without its photo yet; or null. */
async function open(
  deps: Pick<AppDeps, "fetcher">,
  em: EntityManager,
  pick: AiPick
): Promise<Opened | null> {
  try {
    const url = normalizeLink(pick.url)
    if (isVideoLink(url)) return null
    const page = await deps.fetcher(url)
    const pageUrl = normalizeLink(page.url)
    // In the library already: nothing new.
    if (await findBySourceUrl(em, [url, pageUrl])) return null
    const data = readRecipeData(
      decodeHtml(page.body, page.contentType),
      pageUrl
    )
    if (!data) return null
    const input = data.input
    return {
      url: pageUrl,
      name: input.name,
      site: new URL(pageUrl).hostname.replace(/^www\./, ""),
      minutes:
        input.totalMinutes ??
        ((input.prepMinutes ?? 0) + (input.cookMinutes ?? 0) || null),
      photoUrl: data.photoUrls[0] ?? null,
      why: pick.why.replace(/\s+/g, " ").trim().slice(0, 300),
    }
  } catch {
    return null
  }
}

/**
 * Runs `work` on each item, `size` at a time, starting the next as each
 * finishes, while `going` says to. When one throws, the others finish what
 * they're on and start nothing more, and every one is waited for before it's
 * thrown on, so nothing is still saving as the round ends.
 */
async function inPool<T>(
  items: readonly T[],
  size: number,
  going: () => boolean,
  work: (item: T) => Promise<void>
) {
  const queue = [...items]
  let broken = false
  const worker = async () => {
    while (!broken && going()) {
      const item = queue.shift()
      if (item === undefined) return
      try {
        await work(item)
      } catch (err) {
        broken = true
        throw err
      }
    }
  }
  const workers = await Promise.allSettled(
    Array.from({ length: Math.min(size, queue.length) }, worker)
  )
  const failed = workers.find((result) => result.status === "rejected")
  if (failed) throw failed.reason
}

/** Merran is shutting down: the job runs again at the next start. */
const shuttingDown = (signal: AbortSignal) =>
  signal.aborted &&
  signal.reason instanceof JobStopped &&
  signal.reason.why === "shutdown"

/** Someone stopped the job. */
const wasCancelled = (signal: AbortSignal) =>
  signal.aborted &&
  signal.reason instanceof JobStopped &&
  signal.reason.why === "cancelled"
