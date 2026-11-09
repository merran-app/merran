import assert from "node:assert/strict"
import { test } from "node:test"
import { offerLink } from "./offer-link.ts"

const link = {
  title: "Lemon Pasta",
  text: "A recipe from Merran",
  url: "https://merran.example.com/r/abc",
}

/** A navigator that records what was shared and copied. */
function fakeNavigator(share?: (data: ShareData) => Promise<void>) {
  const copied: string[] = []
  const nav = {
    share,
    clipboard: {
      writeText: async (text: string) => {
        copied.push(text)
      },
    },
  } as unknown as Pick<Navigator, "share" | "clipboard">
  return { nav, copied }
}

test("it hands the link to the share sheet when there is one", async () => {
  const shared: ShareData[] = []
  const { nav, copied } = fakeNavigator(async (data) => {
    shared.push(data)
  })

  assert.equal(await offerLink(link, nav), "shared")
  assert.deepEqual(shared, [link])
  assert.deepEqual(copied, [])
})

test("closing the share sheet is a cancel, and copies nothing", async () => {
  const { nav, copied } = fakeNavigator(async () => {
    throw new DOMException("", "AbortError")
  })

  assert.equal(await offerLink(link, nav), "cancelled")
  assert.deepEqual(copied, [])
})

test("with no share sheet, it copies the link", async () => {
  const { nav, copied } = fakeNavigator(undefined)

  assert.equal(await offerLink(link, nav), "copied")
  assert.deepEqual(copied, [link.url])
})

test("a share sheet that fails for another reason copies the link", async () => {
  const { nav, copied } = fakeNavigator(async () => {
    throw new Error("nope")
  })

  assert.equal(await offerLink(link, nav), "copied")
  assert.deepEqual(copied, [link.url])
})

test("Safari refusing the share sheet is passed on, so a fresh tap can retry", async () => {
  const { nav, copied } = fakeNavigator(async () => {
    throw new DOMException("", "NotAllowedError")
  })

  await assert.rejects(offerLink(link, nav), { name: "NotAllowedError" })
  assert.deepEqual(copied, [])
})
