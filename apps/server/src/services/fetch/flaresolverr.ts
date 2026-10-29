import { z } from "zod"
import { AppError } from "../../core/errors.ts"
import {
  checkPublicLink,
  type FetchedResource,
  type Fetcher,
} from "./public-fetch.ts"

// FlareSolverr opens a page in a real browser and waits out Cloudflare's
// checks. Merran asks the server admin's own, and only for a link someone
// is importing that the site turned Merran away from: never for its own
// background reads, which stay as Merran (see docs/flaresolverr-imports.md).

/** How long FlareSolverr's browser may take; a fresh one is slow to start. */
const SOLVE_MS = 55_000

/** What FlareSolverr says when it has the page. */
const Solved = z.object({
  status: z.literal("ok"),
  solution: z.object({
    url: z.string(),
    status: z.number(),
    response: z.string(),
  }),
})

/** What FlareSolverr says about itself. */
const Ready = z.object({
  status: z.literal("ok"),
  version: z.string().optional(),
})

/** Where FlareSolverr takes commands, however its address was written. */
function commands(address: string) {
  return `${address.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`
}

function readJson(body: Buffer): unknown {
  try {
    return JSON.parse(body.toString("utf8"))
  } catch {
    return null
  }
}

const stillRefused = () =>
  new AppError(
    "upstream",
    "site_refused",
    "That site turned Merran away, even through FlareSolverr. Import it with the browser extension, or type it in."
  )

/**
 * The page at a public link, as FlareSolverr's browser saw it. Throws as
 * the site turning Merran away when FlareSolverr couldn't get it either, and
 * refuses a page that ended up on the home network.
 */
export async function solvePage(
  fetcher: Fetcher,
  address: string,
  url: string
): Promise<FetchedResource> {
  // FlareSolverr's browser reaches whatever its container can, so the link
  // is checked here, before and after, rather than by the fetcher.
  await checkPublicLink(url)

  let answer
  try {
    answer = await fetcher(commands(address), {
      homeNetwork: true,
      accept: "application/json",
      json: { cmd: "request.get", url, maxTimeout: SOLVE_MS },
      maxBytes: 20_000_000,
      timeoutMs: SOLVE_MS + 5_000,
      keepErrors: true,
    })
  } catch {
    throw stillRefused()
  }

  const solved = Solved.safeParse(readJson(answer.body))
  if (!solved.success || solved.data.solution.status >= 400) {
    throw stillRefused()
  }
  const { solution } = solved.data
  const page = await checkPublicLink(solution.url)
  return {
    url: page.toString(),
    status: solution.status,
    contentType: "text/html; charset=utf-8",
    body: Buffer.from(solution.response, "utf8"),
  }
}

/** Whether FlareSolverr answers at this address, and which version it is. */
export async function checkFlareSolverr(
  fetcher: Fetcher,
  address: string
): Promise<{ version: string | null }> {
  let answer
  try {
    answer = await fetcher(commands(address), {
      homeNetwork: true,
      accept: "application/json",
      json: { cmd: "sessions.list" },
      maxBytes: 100_000,
      keepErrors: true,
    })
  } catch {
    throw new AppError(
      "upstream",
      "flaresolverr_unreachable",
      `Couldn't reach FlareSolverr at ${address}.`
    )
  }

  const ready = Ready.safeParse(readJson(answer.body))
  if (!ready.success) {
    throw new AppError(
      "upstream",
      "flaresolverr_unexpected",
      "That address answered, but not like FlareSolverr does."
    )
  }
  return { version: ready.data.version ?? null }
}
