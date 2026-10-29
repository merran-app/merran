import { describe, expect, test } from "vitest"
import { AppError } from "../../core/errors.ts"
import { checkFlareSolverr, solvePage } from "./flaresolverr.ts"
import type { FetchOptions, Fetcher } from "./public-fetch.ts"

const ADDRESS = "http://flaresolverr:8191"
// Public addresses as numbers, so the tests never look a name up.
const SOUP = "http://93.184.216.34/soup"

/** A FlareSolverr that answers with this, and remembers what it was asked. */
function fakeFlareSolverr(answer: unknown) {
  const asked: { url: string; options: FetchOptions }[] = []
  const fetcher: Fetcher = async (url, options = {}) => {
    asked.push({ url, options })
    return {
      url,
      status: 200,
      contentType: "application/json",
      body: Buffer.from(
        typeof answer === "string" ? answer : JSON.stringify(answer)
      ),
    }
  }
  return { fetcher, asked }
}

const solved = (solution: Record<string, unknown> = {}) => ({
  status: "ok",
  message: "Challenge solved!",
  solution: {
    url: SOUP,
    status: 200,
    headers: {},
    response: "<html><body>Soup</body></html>",
    cookies: [],
    userAgent: "Mozilla/5.0 Chrome",
    ...solution,
  },
  version: "3.3.21",
})

describe("pages through FlareSolverr", () => {
  test("ask FlareSolverr for the page, and keep what its browser saw", async () => {
    const { fetcher, asked } = fakeFlareSolverr(
      solved({ url: "http://93.184.216.34/soup/" })
    )
    const page = await solvePage(fetcher, ADDRESS, SOUP)

    expect(page).toMatchObject({
      url: "http://93.184.216.34/soup/",
      status: 200,
      contentType: "text/html; charset=utf-8",
    })
    expect(page.body.toString()).toBe("<html><body>Soup</body></html>")
    expect(asked).toHaveLength(1)
    expect(asked[0]!.url).toBe("http://flaresolverr:8191/v1")
    expect(asked[0]!.options).toMatchObject({
      homeNetwork: true,
      json: { cmd: "request.get", url: SOUP },
    })
    expect(asked[0]!.options.timeoutMs).toBeGreaterThan(
      (asked[0]!.options.json as { maxTimeout: number }).maxTimeout
    )
  })

  test("take FlareSolverr's address with or without its path", async () => {
    for (const address of [
      "http://flaresolverr:8191/",
      "http://flaresolverr:8191/v1",
    ]) {
      const { fetcher, asked } = fakeFlareSolverr(solved())
      await solvePage(fetcher, address, SOUP)
      expect(asked[0]!.url, address).toBe("http://flaresolverr:8191/v1")
    }
  })

  test("say the site still turned Merran away when FlareSolverr couldn't get through", async () => {
    const unreachable: Fetcher = async () => {
      throw new AppError(
        "upstream",
        "site_unreachable",
        "Couldn't reach that site."
      )
    }
    for (const fetcher of [
      unreachable,
      fakeFlareSolverr({ status: "error", message: "Timeout" }).fetcher,
      fakeFlareSolverr(solved({ status: 403 })).fetcher,
      fakeFlareSolverr("<html>Not FlareSolverr</html>").fetcher,
    ]) {
      await expect(solvePage(fetcher, ADDRESS, SOUP)).rejects.toMatchObject({
        code: "site_refused",
        message: expect.stringMatching(/even through FlareSolverr/),
      })
    }
  })

  test("never send a private link, nor keep a page that ended up on one", async () => {
    const { fetcher, asked } = fakeFlareSolverr(solved())
    await expect(
      solvePage(fetcher, ADDRESS, "http://10.0.0.1/soup")
    ).rejects.toThrow(/private network/)
    expect(asked).toHaveLength(0)

    const steered = fakeFlareSolverr(
      solved({ url: "http://192.168.1.1/admin" })
    )
    await expect(solvePage(steered.fetcher, ADDRESS, SOUP)).rejects.toThrow(
      /private network/
    )
  })
})

describe("checking FlareSolverr", () => {
  test("say which FlareSolverr answered", async () => {
    const { fetcher, asked } = fakeFlareSolverr({
      status: "ok",
      message: "",
      sessions: [],
      version: "3.3.21",
    })
    expect(await checkFlareSolverr(fetcher, ADDRESS)).toEqual({
      version: "3.3.21",
    })
    expect(asked[0]).toMatchObject({
      url: "http://flaresolverr:8191/v1",
      options: { homeNetwork: true, json: { cmd: "sessions.list" } },
    })
  })

  test("say why not, when it isn't there or isn't FlareSolverr", async () => {
    const unreachable: Fetcher = async () => {
      throw new AppError(
        "upstream",
        "site_unreachable",
        "Couldn't reach that site."
      )
    }
    await expect(checkFlareSolverr(unreachable, ADDRESS)).rejects.toThrow(
      "Couldn't reach FlareSolverr at http://flaresolverr:8191."
    )
    await expect(
      checkFlareSolverr(
        fakeFlareSolverr("<html>Router</html>").fetcher,
        ADDRESS
      )
    ).rejects.toThrow(/not like FlareSolverr/)
  })
})
