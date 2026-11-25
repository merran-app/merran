import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pino } from "pino"
import sharp from "sharp"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import { AppError } from "../../../core/errors.ts"
import {
  Discovery,
  Household,
  type DiscoveredRecipe,
} from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { forHousehold } from "../../../database/scope.ts"
import { createTestDatabase } from "../../../test/database.ts"
import type { Fetcher } from "../../fetch/public-fetch.ts"
import { JobStopped } from "../../jobs/runner.ts"
import { LocalFileStore } from "../../storage/files.ts"
import { foundPhotoPath } from "./photos.ts"
import { runRound, type AiPick, type RoundSaved } from "./rounds.ts"

let database: Database
let close: () => Promise<void>
let home: string
let folder: string
let files: LocalFileStore
let deps: { fetcher: Fetcher; files: LocalFileStore }
let jpeg: Buffer

/** Twelve dishes, no two alike. */
const DISHES = [
  "Beef Stew",
  "Chicken Curry",
  "Pad Thai",
  "Caesar Salad",
  "Fish Tacos",
  "Banana Bread",
  "Mushroom Risotto",
  "Pork Dumplings",
  "Shakshuka",
  "Ratatouille",
  "Clam Chowder",
  "Lentil Soup",
]

const slug = (name: string) => name.toLowerCase().replace(/\W+/g, "-")

const recipePage = (name: string, image: string | null) =>
  `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "Recipe",
      name,
      totalTime: "PT30M",
      recipeIngredient: ["1 cup water"],
      recipeInstructions: [{ "@type": "HowToStep", text: "Cook it." }],
      ...(image ? { image } : {}),
    }
  )}</script></head><body></body></html>`

/** The tests' little web: pages and photos by link, each answering once `wait` is done. */
const web = new Map<
  string,
  { body: Buffer | string; contentType: string; wait?: Promise<void> }
>()

/** Every link fetched, in order. */
const fetched: string[] = []

/** Pages being fetched now, and the most there have been at once. */
let pagesNow = 0
let mostPagesAtOnce = 0

/** For each link, a promise that's done once it's been fetched. */
const heard = new Map<string, { promise: Promise<void>; resolve: () => void }>()

function hearing(url: string) {
  let entry = heard.get(url)
  if (!entry) {
    let resolve!: () => void
    const promise = new Promise<void>((done) => {
      resolve = done
    })
    entry = { promise, resolve }
    heard.set(url, entry)
  }
  return entry
}

/** Done once the link has been fetched. */
const whenFetched = (url: string) => hearing(url).promise

const isPhoto = (url: string) => url.endsWith(".jpg")

const fetcher: Fetcher = async (url) => {
  fetched.push(url)
  hearing(url).resolve()
  const page = web.get(url)
  const counted = !isPhoto(url)
  if (counted) {
    pagesNow++
    mostPagesAtOnce = Math.max(mostPagesAtOnce, pagesNow)
  }
  try {
    await page?.wait
  } finally {
    if (counted) pagesNow--
  }
  if (!page) {
    throw new AppError(
      "upstream",
      "site_error",
      "That site answered with an error."
    )
  }
  return {
    url,
    status: 200,
    contentType: page.contentType,
    body: Buffer.from(page.body),
  }
}

/** A promise the test lets go of when it says. */
function gate() {
  let open!: () => void
  const shut = new Promise<void>((done) => {
    open = done
  })
  return { shut, open }
}

const pause = (ms: number) =>
  new Promise<void>((done) => {
    setTimeout(done, ms)
  })

/**
 * A recipe page on the little web, with a photo unless it says not; answers
 * the AI's pick for it.
 */
function recipe(
  url: string,
  name: string,
  options: {
    wait?: Promise<void>
    photoWait?: Promise<void>
    photo?: boolean
  } = {}
): AiPick {
  const photo = options.photo === false ? null : `${url}.jpg`
  web.set(url, {
    body: recipePage(name, photo),
    contentType: "text/html; charset=utf-8",
    wait: options.wait,
  })
  if (photo) {
    web.set(photo, {
      body: jpeg,
      contentType: "image/jpeg",
      wait: options.photoWait,
    })
  }
  return { url, name, why: `A good ${name.toLowerCase()}.` }
}

/** A pick whose page won't open. */
const broken = (url: string): AiPick => ({ url, name: "Broken", why: "" })

/** Picks of different dishes, each from a site of its own. */
const fromSites = (count: number, options: { photo?: boolean } = {}) =>
  DISHES.slice(0, count).map((name, i) =>
    recipe(`https://site${i + 1}.example/${slug(name)}`, name, options)
  )

const fetchedPages = () => fetched.filter((url) => !isPhoto(url))

beforeAll(async () => {
  ;({ database, close } = await createTestDatabase())
  const em = database.em.fork()
  const household = em.create(Household, { name: "Home", slug: "home" })
  await em.flush()
  home = household.id
  folder = mkdtempSync(join(tmpdir(), "merran-rounds-"))
  files = new LocalFileStore(folder)
  deps = { fetcher, files }
  jpeg = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#a63" },
  })
    .jpeg()
    .toBuffer()
})

afterAll(async () => {
  await close()
  rmSync(folder, { recursive: true, force: true })
})

beforeEach(() => {
  web.clear()
  heard.clear()
  fetched.length = 0
  pagesNow = 0
  mostPagesAtOnce = 0
})

const em = () => forHousehold(database.em, home)
const logger = pino({ level: "silent" })

/** A search going now, saved, with what it has already. */
async function searching(recipes: DiscoveredRecipe[] = []) {
  const tx = em()
  const search = tx.create(Discovery, {
    household: home,
    theme: "dinners",
    collection: null,
    status: "searching",
    recipes,
  })
  await tx.flush()
  return { tx, search }
}

/**
 * A round's options: the AI answering with each of `answers` in turn, and
 * each call to progress and to the AI recorded.
 */
function roundOptions(
  answers: AiPick[][],
  more: {
    saved?: RoundSaved
    avoid?: string[]
    ask?: () => Promise<AiPick[]>
  } = {}
) {
  const progressed: { done: number; total: number; saved: RoundSaved }[] = []
  const asked: string[][] = []
  const controller = new AbortController()
  const options = {
    householdId: home,
    avoid: more.avoid ?? [],
    ask:
      more.ask ??
      (async (failed: string[]) => {
        asked.push(failed)
        return answers.shift() ?? []
      }),
    saved: more.saved ?? null,
    progress: async (
      done: number,
      total: number,
      soFar?: Record<string, unknown>
    ) => {
      progressed.push({ done, total, saved: soFar as RoundSaved })
    },
    signal: controller.signal,
    logger,
  }
  return { options, progressed, asked, controller }
}

/** The search as it's saved now, not as this test's entity manager has it. */
const stored = (id: string) => em().findOneOrFail(Discovery, { id })

const savedNames = async (id: string) =>
  (await stored(id)).recipes.map((found) => found.name)

describe("a round of Discover", () => {
  test("saves each recipe as its page opens, with its photo", async () => {
    // Six picks from six sites; the third page's photo waits on a promise the
    // test resolves last.
    const slowPhoto = gate()
    const picks = [
      recipe("https://a.example/beef-stew", "Beef Stew"),
      recipe("https://b.example/chicken-curry", "Chicken Curry"),
      recipe("https://c.example/pad-thai", "Pad Thai", {
        photoWait: slowPhoto.shut,
      }),
      recipe("https://d.example/caesar-salad", "Caesar Salad"),
      recipe("https://e.example/fish-tacos", "Fish Tacos"),
      recipe("https://f.example/lentil-soup", "Lentil Soup"),
    ]
    const { tx, search } = await searching()
    const { options, progressed } = roundOptions([picks])

    const round = runRound(deps, tx, search, options)
    await expect.poll(() => savedNames(search.id)).toContain("Lentil Soup")
    expect(await savedNames(search.id)).not.toContain("Pad Thai")
    // The search says how far it's got as it goes.
    await expect
      .poll(async () => (await stored(search.id)).progress)
      .toEqual({ done: 5, total: 6 })
    slowPhoto.open()
    await round

    expect(search.status).toBe("done")
    expect(search.progress).toBeNull()
    expect(search.error).toBeNull()
    expect(search.recipes).toHaveLength(6)
    expect(
      search.recipes.every((found) =>
        found.photo?.startsWith(`/api/discover/${search.id}/photos/`)
      )
    ).toBe(true)
    const photo = await files.read(
      foundPhotoPath(home, search.id, search.recipes[0]!.photoKey!)
    )
    expect(photo).not.toBeNull()
    expect((await stored(search.id)).status).toBe("done")

    const last = progressed.at(-1)!
    expect([last.done, last.total]).toEqual([6, 6])
    expect(last.saved).toEqual({
      startedWith: 0,
      picks,
      tried: expect.arrayContaining(picks.map((pick) => pick.url)),
      failed: [],
      asked: 1,
    })
    expect(last.saved.tried).toHaveLength(6)
  })

  test("opens four at a time, starting the next as each finishes", async () => {
    // Track pages being fetched at once: never over 4, and a fifth starts
    // while one of the first four is still waiting.
    const firstPage = gate()
    const picks = DISHES.slice(0, 6).map((name, i) =>
      recipe(
        `https://site${i + 1}.example/${slug(name)}`,
        name,
        i === 0 ? { wait: firstPage.shut } : {}
      )
    )
    const { tx, search } = await searching()
    const { options } = roundOptions([picks])

    const round = runRound(deps, tx, search, options)
    await expect.poll(() => fetchedPages()).toContain(picks[4]!.url)
    await expect.poll(() => fetchedPages()).toContain(picks[5]!.url)
    firstPage.open()
    await round

    expect(mostPagesAtOnce).toBe(4)
    expect(search.recipes).toHaveLength(6)
  })

  test("keeps one of two pages of the same dish that open at once", async () => {
    // Two picks, "Easy Lentil Soup" and "Lentil Soup", whose photos both wait
    // until both pages have opened. Lentil Soup's page answers once Easy
    // Lentil Soup's photo is asked for, so which opens first is known.
    const easy = "https://a.example/easy-lentil-soup"
    const plain = "https://b.example/lentil-soup"
    const bothOpened = whenFetched(plain).then(() => pause(20))
    const picks = [
      recipe(easy, "Easy Lentil Soup", { photoWait: bothOpened }),
      recipe(plain, "Lentil Soup", {
        wait: whenFetched(`${easy}.jpg`),
        photoWait: bothOpened,
      }),
    ]
    const { tx, search } = await searching()
    const { options } = roundOptions([picks, []])

    await runRound(deps, tx, search, options)

    expect(search.recipes.map((found) => found.name)).toEqual([
      "Easy Lentil Soup",
    ])
    // It was left out as its page opened, so its photo was never fetched.
    expect(fetched).not.toContain(`${plain}.jpg`)
  })

  test("stops opening once the round has eight", async () => {
    // Twelve picks from twelve sites: eight saved, and fewer than twelve
    // pages fetched.
    const picks = fromSites(12)
    const { tx, search } = await searching()
    const { options } = roundOptions([picks])

    await runRound(deps, tx, search, options)

    expect(search.status).toBe("done")
    expect(search.recipes).toHaveLength(8)
    expect((await stored(search.id)).recipes).toHaveLength(8)
    expect(fetchedPages().length).toBeLessThan(12)
  })

  test("takes no more than two from a site, unless there aren't others", async () => {
    // Five picks from a.example, then two from b.example: two from a, then
    // the two from b, then a's other three, held back until the end, fill
    // the round. All seven are kept, in that order.
    const names = DISHES.slice(0, 7)
    const picks = names.map((name, i) =>
      recipe(`https://${i < 5 ? "a" : "b"}.example/${slug(name)}`, name, {
        photo: false,
      })
    )
    const { tx, search } = await searching()
    const { options, asked } = roundOptions([picks])

    await runRound(deps, tx, search, options)

    expect(search.recipes.map((found) => found.site)).toEqual([
      "a.example",
      "a.example",
      "b.example",
      "b.example",
      "a.example",
      "a.example",
      "a.example",
    ])
    expect(search.recipes.map((found) => found.name).sort()).toEqual(
      [...names].sort()
    )
    expect(asked).toEqual([[]])
  })

  test("asks the AI once more, saying which didn't open, when fewer than four open", async () => {
    const first = [
      broken("https://broken.example/one"),
      recipe("https://a.example/beef-stew", "Beef Stew"),
      broken("https://broken.example/two"),
    ]
    const second = [
      recipe("https://b.example/pad-thai", "Pad Thai"),
      recipe("https://c.example/fish-tacos", "Fish Tacos"),
    ]
    const { tx, search } = await searching()
    const { options, asked, progressed } = roundOptions([first, second])

    await runRound(deps, tx, search, options)

    expect(asked).toEqual([
      [],
      ["https://broken.example/one", "https://broken.example/two"],
    ])
    expect(search.recipes.map((found) => found.name).sort()).toEqual([
      "Beef Stew",
      "Fish Tacos",
      "Pad Thai",
    ])
    const last = progressed.at(-1)!
    expect([last.done, last.total]).toEqual([5, 5])
    expect(last.saved).toEqual({
      startedWith: 0,
      picks: [...first, ...second],
      tried: expect.arrayContaining([...first, ...second].map((p) => p.url)),
      failed: ["https://broken.example/one", "https://broken.example/two"],
      asked: 2,
    })
    expect(last.saved.tried).toHaveLength(5)
  })

  test("carries on after a restart from the picks it was given", async () => {
    // saved: three picks, the first tried; ask throws if it's called.
    const [first, second, third] = fromSites(3, { photo: false }) as [
      AiPick,
      AiPick,
      AiPick,
    ]
    const before: DiscoveredRecipe = {
      url: first.url,
      name: first.name,
      site: "site1.example",
      minutes: 30,
      photo: null,
      why: first.why,
    }
    const { tx, search } = await searching([before])
    const saved: RoundSaved = {
      startedWith: 0,
      picks: [first, second, third],
      tried: [first.url],
      failed: [],
      asked: 2,
    }
    const { options, progressed } = roundOptions([], {
      saved,
      ask: async () => {
        throw new Error("The AI was asked again.")
      },
    })

    await runRound(deps, tx, search, options)

    expect(fetchedPages()).toEqual([second.url, third.url])
    expect(search.status).toBe("done")
    expect(search.recipes[0]).toEqual(before)
    expect(search.recipes.map((found) => found.name).sort()).toEqual(
      [first.name, second.name, third.name].sort()
    )
    const last = progressed.at(-1)!
    expect([last.done, last.total]).toEqual([3, 3])
    expect(last.saved).toEqual({
      ...saved,
      tried: [first.url, expect.any(String), expect.any(String)],
    })
  })

  test("opens a held-back pick again after a restart, without asking the AI again", async () => {
    // Three picks from a.example and one from b.example, whose page waits.
    // The third from a is held back when Merran shuts down. What's kept with
    // the job doesn't count it as tried, so after the restart its page is
    // opened again; with it, the round has four, and the AI isn't asked.
    const bPage = gate()
    const picks = [
      recipe("https://a.example/beef-stew", "Beef Stew", { photo: false }),
      recipe("https://a.example/chicken-curry", "Chicken Curry", {
        photo: false,
      }),
      recipe("https://a.example/pad-thai", "Pad Thai", { photo: false }),
      recipe("https://b.example/fish-tacos", "Fish Tacos", {
        photo: false,
        wait: bPage.shut,
      }),
    ]
    const { tx, search } = await searching()
    const before = roundOptions([picks])

    const round = runRound(deps, tx, search, before.options)
    await expect.poll(() => before.progressed.at(-1)?.done).toBe(3)
    before.controller.abort(new JobStopped("shutdown"))
    bPage.open()
    await expect(round).rejects.toBeInstanceOf(JobStopped)

    const kept = await savedNames(search.id)
    expect(kept).toHaveLength(2)
    const heldBack = picks.find(
      (pick) => pick.url.startsWith("https://a.") && !kept.includes(pick.name)
    )!
    const saved = before.progressed.at(-1)!.saved
    expect(saved.tried).not.toContain(heldBack.url)

    fetched.length = 0
    const restarted = em()
    const again = await restarted.findOneOrFail(Discovery, { id: search.id })
    let askedAgain = 0
    const after = roundOptions([], {
      saved,
      ask: async () => {
        askedAgain++
        return []
      },
    })
    await runRound(deps, restarted, again, after.options)

    expect(fetchedPages()).toContain(heldBack.url)
    expect(askedAgain).toBe(0)
    expect(again.status).toBe("done")
    expect(again.recipes.map((found) => found.name).sort()).toEqual(
      picks.map((pick) => pick.name).sort()
    )
  })

  test("tells its job how far it's got once the search says so", async () => {
    // The web app reads the search again when it hears the job's event, so
    // the search has the progress first. One pick, so nothing else saves
    // between the two.
    const { tx, search } = await searching()
    const { options } = roundOptions([fromSites(1, { photo: false }), []])
    const seen: { told: unknown; saved: unknown }[] = []
    options.progress = async (done: number, total: number) => {
      const saved = (await stored(search.id)).progress
      seen.push({ told: { done, total }, saved })
    }

    await runRound(deps, tx, search, options)

    expect(seen.length).toBeGreaterThan(0)
    for (const { told, saved } of seen) expect(saved).toEqual(told)
  })

  test("says it's searching the web again while the AI is asked once more", async () => {
    const answers = [[broken("https://broken.example/one")], []]
    const { tx, search } = await searching()
    let whileAskedAgain: unknown = "not asked again"
    const { options } = roundOptions([], {
      ask: async () => {
        if (answers.length === 1) {
          whileAskedAgain = (await stored(search.id)).progress
        }
        return answers.shift() ?? []
      },
    })

    await runRound(deps, tx, search, options)

    expect(whileAskedAgain).toBeNull()
  })

  test("fetches the held-back recipes' photos together, saving them in the order they opened", async () => {
    // Four picks from a.example, opened one after another: two are the
    // round's, two held back. The first held back's photo waits, and the
    // second's is fetched meanwhile, but isn't saved before it. The round's
    // own two are saved as their photos come, in either order.
    const slowPhoto = gate()
    const thirdTold = gate()
    const names = DISHES.slice(0, 4)
    const urls = names.map((name) => `https://a.example/${slug(name)}`)
    const picks = [
      recipe(urls[0]!, names[0]!),
      recipe(urls[1]!, names[1]!, { wait: whenFetched(`${urls[0]}.jpg`) }),
      recipe(urls[2]!, names[2]!, {
        wait: whenFetched(`${urls[1]}.jpg`),
        photoWait: slowPhoto.shut,
      }),
      recipe(urls[3]!, names[3]!, { wait: thirdTold.shut }),
    ]
    const { tx, search } = await searching()
    const { options } = roundOptions([picks, []])
    options.progress = async (done: number) => {
      if (done === 3) thirdTold.open()
    }

    const round = runRound(deps, tx, search, options)
    await expect.poll(() => fetched).toContain(`${urls[3]}.jpg`)
    expect((await savedNames(search.id)).sort()).toEqual(
      names.slice(0, 2).sort()
    )
    slowPhoto.open()
    await round

    expect(search.status).toBe("done")
    const saved = search.recipes.map((found) => found.name)
    expect(saved.slice(0, 2).sort()).toEqual(names.slice(0, 2).sort())
    expect(saved.slice(2)).toEqual(names.slice(2))
  })

  test("a progress save that waits its turn as it's stopped doesn't write progress over the stop", async () => {
    // The first pick's progress is saving, held up, when the second, which
    // doesn't open, is tried, so its progress waits its turn; the stop comes
    // while it waits. The search must say stopped, with no progress, at
    // once: not "2 of 3" until the last page opens and the round ends.
    const rest = gate()
    const saveHeld = gate()
    const letSaveGo = gate()
    let failSecond!: (err: Error) => void
    const secondAnswers = new Promise<void>((_, reject) => {
      failSecond = reject
    })
    const first = recipe("https://site1.example/beef-stew", "Beef Stew", {
      photo: false,
    })
    const second: AiPick = {
      url: "https://site2.example/not-a-page",
      name: "Not a page",
      why: "",
    }
    web.set(second.url, {
      body: "",
      contentType: "text/html",
      wait: secondAnswers,
    })
    const third = recipe("https://site3.example/pad-thai", "Pad Thai", {
      wait: rest.shut,
    })
    const { tx, search } = await searching()
    const { options, controller } = roundOptions([[first, second, third]])
    const flush = tx.flush.bind(tx)
    let held = false
    vi.spyOn(tx, "flush").mockImplementation(async () => {
      if (!held && search.progress?.done === 1) {
        held = true
        saveHeld.open()
        await letSaveGo.shut
      }
      await flush()
    })

    const round = runRound(deps, tx, search, options)
    await saveHeld.shut
    await whenFetched(second.url)
    failSecond(new Error("It didn't answer."))
    // Nothing's awaited between its page failing and its save being asked
    // for, so by the next turn of the event loop that save is waiting.
    await pause(0)
    controller.abort(new JobStopped("cancelled"))
    letSaveGo.open()

    await expect
      .poll(async () => {
        const saved = await stored(search.id)
        return [saved.status, saved.progress]
      })
      .toEqual(["stopped", null])
    rest.open()

    await expect(round).rejects.toBeInstanceOf(JobStopped)
    expect((await stored(search.id)).recipes).toHaveLength(1)
  })

  test("ends stopped, not done, when it's stopped as its last pick is tried", async () => {
    // The stop arrives as the last pick's progress is told, with nothing
    // left to open. Which of the round's checks catches it isn't pinned here.
    const picks = fromSites(3)
    const { tx, search } = await searching()
    const { options, controller } = roundOptions([picks])
    options.progress = async (done: number, total: number) => {
      if (done === total) controller.abort(new JobStopped("cancelled"))
    }

    await expect(runRound(deps, tx, search, options)).rejects.toBeInstanceOf(
      JobStopped
    )

    const saved = await stored(search.id)
    expect(saved.status).toBe("stopped")
    expect(saved.progress).toBeNull()
    expect(saved.recipes).toHaveLength(3)
  })

  test("ends stopped, with what it found, when it's stopped", async () => {
    // Abort with new JobStopped("cancelled") once the first recipe is saved.
    const rest = gate()
    const picks = DISHES.slice(0, 6).map((name, i) =>
      recipe(
        `https://site${i + 1}.example/${slug(name)}`,
        name,
        i === 0 ? {} : { wait: rest.shut }
      )
    )
    const { tx, search } = await searching()
    const { options, controller } = roundOptions([picks])

    const round = runRound(deps, tx, search, options)
    await expect.poll(() => savedNames(search.id)).toHaveLength(1)
    controller.abort(new JobStopped("cancelled"))
    rest.open()

    await expect(round).rejects.toBeInstanceOf(JobStopped)
    expect(search.status).toBe("stopped")
    expect(search.progress).toBeNull()
    expect(search.recipes).toHaveLength(1)
    const saved = await stored(search.id)
    expect(saved.status).toBe("stopped")
    expect(saved.recipes).toHaveLength(1)
    // Nothing started after the stop.
    expect(fetchedPages()).not.toContain(picks[5]!.url)
  })

  test("stays searching when stopped for a restart", async () => {
    // Abort with new JobStopped("shutdown").
    const rest = gate()
    const picks = DISHES.slice(0, 6).map((name, i) =>
      recipe(
        `https://site${i + 1}.example/${slug(name)}`,
        name,
        i === 0 ? {} : { wait: rest.shut }
      )
    )
    const { tx, search } = await searching()
    const { options, controller } = roundOptions([picks])

    const round = runRound(deps, tx, search, options)
    await expect.poll(() => savedNames(search.id)).toHaveLength(1)
    controller.abort(new JobStopped("shutdown"))
    rest.open()

    await expect(round).rejects.toBeInstanceOf(JobStopped)
    expect(search.status).toBe("searching")
    const saved = await stored(search.id)
    expect(saved.status).toBe("searching")
    expect(saved.recipes).toHaveLength(1)
  })

  test("says nothing else turned up when a round finds nothing online", async () => {
    // A search with a shelf match, and picks that don't open.
    const shelf: DiscoveredRecipe = {
      url: "https://example.com/minestrone-soup",
      name: "Minestrone Soup",
      site: "example.com",
      minutes: null,
      photo: "/api/sites/recipes/0a1b/photo",
      shelfId: "0a1b",
      why: "",
    }
    const { tx, search } = await searching([shelf])
    const { options, asked } = roundOptions([
      [broken("https://broken.example/one")],
      [broken("https://broken.example/two")],
    ])

    await runRound(deps, tx, search, options)

    expect(asked).toHaveLength(2)
    expect(search.status).toBe("done")
    expect(search.error).toBe(
      "Nothing else turned up online that Merran could open."
    )
    expect(search.recipes).toEqual([shelf])
  })

  test("fails with what the AI said, keeping what it found", async () => {
    const { tx, search } = await searching()
    const { options } = roundOptions([], {
      ask: async () => {
        throw new AppError(
          "unprocessable",
          "ai_model_cant",
          "Discover needs a model that can search the web."
        )
      },
    })

    await runRound(deps, tx, search, options)

    expect(search.status).toBe("failed")
    expect(search.progress).toBeNull()
    expect(search.error).toBe("Discover needs a model that can search the web.")
    expect((await stored(search.id)).status).toBe("failed")
  })
})
