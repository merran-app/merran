import { covers, foodKey, readAmount, type ModelAbility } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { generateText, Output, type UserContent } from "ai"
import sharp from "sharp"
import { v7 as uuidv7 } from "uuid"
import { z } from "zod"
import type { AppDeps } from "../../../core/context.ts"
import { AppError } from "../../../core/errors.ts"
import {
  Job,
  Purchase,
  Receipt,
  ShoppingItem,
  User,
  type ReceiptFile,
  type ReceiptLine,
} from "../../../database/entities/index.ts"
import { householdKeys } from "../../foods/aliases.ts"
import {
  failureOf,
  HANDOVER_MS,
  waitThenHandOver,
} from "../../jobs/hand-over.ts"
import { ACTIVE, enqueue } from "../../jobs/jobs.ts"
import { JobStopped, type JobHandler } from "../../jobs/runner.ts"
import { currentActor, withActor, type Actor } from "../../webhooks/actor.ts"
import { useAi, type AiDeps } from "../../ai/run.ts"
import { householdToday } from "../../households/clock.ts"
import { recordListChange } from "../../webhooks/events/list.ts"
import { recordPantryChange } from "../../webhooks/events/pantry.ts"
import { placeFor, store } from "../pantry.ts"
import { inHouseholdTransaction } from "../../../database/transactions.ts"
import { toNumber } from "../../../database/numbers.ts"
import type { FileStore } from "../../storage/files.ts"

// Receipts into the pantry: a photo of a paper one, screenshots or a PDF
// of an emailed one, or its text. The household's small model reads the
// lines ("GV WHL MLK 1GAL" is whole milk, 1 gal), and they wait for a look
// before anything goes in. What's added is put away like shopping: in the
// fridge, freezer or cupboard with a use-by guess, kept for the meals it
// was bought for, and noted for usual buys; and it comes off the list.

/** Up to this many files a receipt. */
export const MAX_RECEIPT_FILES = 6

/** The largest PDF of a receipt. */
const MAX_PDF_BYTES = 10_000_000

/** Tiles cut from one tall screenshot, at most. */
const MAX_TILES = 8

/** Receipt text past this isn't read; no receipt is this long. */
const MAX_TEXT = 40_000

/** A receipt waits this long for its look before it's forgotten. */
const KEEP_MS = 24 * 60 * 60_000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SYSTEM = `You read grocery receipts: photos, screenshots, PDFs, or the text of an emailed receipt or order confirmation. List what was bought.
- First, "what" it is: "receipt" for a receipt or order confirmation, "recipe" for a recipe (ingredients and steps, a recipe card, a screenshot of one), "other" for anything else.
- One entry per product line. Skip totals, subtotals, tax, payment, change, coupons, discounts, bag fees, deposits and loyalty lines.
- "text" is the line as printed. "name" is the plain grocery name a home cook would write on a list: "GV WHL MLK 1GAL" is "whole milk", "BNLS SKNLS CHKN THGH" is "boneless skinless chicken thighs". Leave brands out unless they're the point (Diet Pepsi).
- "amount" is how much, as a cook would say it: "1 gal", "2.3 lb", "12 ct", "2" for two of something; null when the receipt doesn't say.
- "price" is what was paid for that line, after any discount on it; null if unclear.
- "kind": "food" for anything eaten or drunk (soda too), "household" for paper goods, cleaning, toiletries and the like, "other" for anything else.
- "store" and "date" (YYYY-MM-DD) from the receipt when shown, else null. "total" is the amount paid, else null.
If it isn't a receipt, return no items.`

const ReadReceipt = z.object({
  what: z.enum(["receipt", "recipe", "other"]),
  store: z.string().nullable(),
  date: z.string().nullable(),
  total: z.number().nullable(),
  items: z.array(
    z.object({
      text: z.string(),
      name: z.string(),
      amount: z.string().nullable(),
      price: z.number().nullable(),
      kind: z.enum(["food", "household", "other"]),
    })
  ),
})

/** What came in to read: files of any kind, and text. */
export type ReceiptInput = {
  files: readonly { body: Buffer; type: string }[]
  text: string | null
}

const isPdf = (body: Buffer) =>
  body.subarray(0, 5).toString("latin1") === "%PDF-"

const fileKey = (householdId: string, receiptId: string, index: number) =>
  `receipts/${householdId}/${receiptId}/${index}`

/** An emailed receipt's text, without its HTML. */
export function plainText(text: string) {
  return /<\/?[a-z][^>]*>/i.test(text)
    ? text
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/[ \t]+/g, " ")
        .replace(/ ?\n ?/g, "\n")
        .replace(/\n\s*\n+/g, "\n")
        .trim()
    : text.trim()
}

/**
 * A photo for the model, and the copy kept to compare with. A tall
 * screenshot of an emailed receipt is cut into overlapping tiles, so the
 * print stays big enough to read.
 */
async function readPicture(body: Buffer) {
  let upright: Buffer
  let width: number
  let height: number
  try {
    const image = sharp(body, { failOn: "error" }).rotate()
    upright = await image.toBuffer()
    const meta = await sharp(upright).metadata()
    width = meta.width ?? 0
    height = meta.height ?? 0
    if (!width || !height) throw new Error("No size")
  } catch {
    throw new AppError(
      "invalid",
      "not_a_receipt_file",
      "One of those files isn't a photo, screenshot or PDF Merran can read."
    )
  }
  const tileHeight = Math.round(width * 1.4)
  const tiles =
    height > tileHeight * 1.3
      ? Math.min(MAX_TILES, Math.ceil(height / (tileHeight - 80)))
      : 1
  const parts: Exclude<UserContent, string> = []
  for (let i = 0; i < tiles; i++) {
    const top =
      tiles === 1 ? 0 : Math.round(((height - tileHeight) * i) / (tiles - 1))
    const piece = sharp(upright)
    if (tiles > 1) {
      piece.extract({
        left: 0,
        top,
        width,
        height: Math.min(tileHeight, height - top),
      })
    }
    const jpeg = await piece
      .resize({
        width: 1400,
        height: 2000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer()
    parts.push({ type: "file", data: jpeg, mediaType: "image/jpeg" })
  }
  const kept = await sharp(upright)
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer()
  return { parts, kept }
}

/**
 * What can be refused without reading anything: too many files, a PDF
 * that's too big, or nothing at all. A scan checks these before it makes
 * a receipt or a job, so they answer at once.
 */
function checkInput(input: ReceiptInput) {
  if (input.files.length > MAX_RECEIPT_FILES) {
    throw new AppError(
      "invalid",
      "too_many_files",
      `Use ${MAX_RECEIPT_FILES} files or fewer for one receipt.`
    )
  }
  for (const file of input.files) {
    if (isPdf(file.body) && file.body.length > MAX_PDF_BYTES) {
      throw new AppError(
        "too_large",
        "file_too_large",
        "That PDF is too big. Use one under 10 MB."
      )
    }
  }
  if (input.files.length === 0 && !input.text?.trim()) {
    throw new AppError(
      "invalid",
      "no_receipt",
      "Add a photo, screenshot or PDF of the receipt, or paste its text."
    )
  }
}

/** What the model reads, what's kept to look at, and what the model needs. */
async function receiptContent(input: ReceiptInput) {
  checkInput(input)
  const content: Exclude<UserContent, string> = []
  const kept: { body: Buffer; mediaType: ReceiptFile["mediaType"] }[] = []
  const texts: string[] = []
  const needs = new Set<ModelAbility>(["structured"])
  for (const file of input.files) {
    if (isPdf(file.body)) {
      content.push({
        type: "file",
        data: file.body,
        mediaType: "application/pdf",
      })
      kept.push({ body: file.body, mediaType: "application/pdf" })
      needs.add("pdfs")
    } else if (file.type.startsWith("text/")) {
      texts.push(plainText(file.body.toString("utf8")))
    } else {
      const picture = await readPicture(file.body)
      content.push(...picture.parts)
      kept.push({ body: picture.kept, mediaType: "image/jpeg" })
      needs.add("images")
    }
  }
  if (input.text) texts.push(plainText(input.text))
  const text = texts.filter(Boolean).join("\n\n").slice(0, MAX_TEXT)
  if (content.length === 0 && !text) {
    throw new AppError(
      "invalid",
      "no_receipt",
      "Add a photo, screenshot or PDF of the receipt, or paste its text."
    )
  }
  content.push({
    type: "text",
    text: text ? `The receipt:\n\n${text}` : "Read this receipt.",
  })
  return { content, kept, needs: [...needs] }
}

/** A receipt as the API shows it. */
export function describeReceipt(receipt: Receipt) {
  return {
    id: receipt.id,
    store: receipt.store ?? null,
    date: receipt.date ?? null,
    total: toNumber(receipt.total),
    status: receipt.status,
    error: receipt.error ?? null,
    lines: receipt.lines,
    files: receipt.files.map((file, index) => ({
      url: `/api/pantry/receipts/${receipt.id}/files/${index}`,
      mediaType: file.mediaType,
    })),
    createdAt: receipt.createdAt.toISOString(),
  }
}
export type ReceiptView = ReturnType<typeof describeReceipt>

/**
 * The shopping list items lines were bought for: the same food, not yet
 * checked off, each matched once.
 */
async function matchList(
  em: EntityManager,
  lines: readonly Omit<ReceiptLine, "listItem">[]
): Promise<ReceiptLine[]> {
  const keyOf = await householdKeys(em)
  const waiting = await em.find(
    ShoppingItem,
    { checked: false },
    { fields: ["id", "name"], orderBy: { createdAt: "asc" } }
  )
  // Checked rows that already put their food away: a line for one of these
  // is the same purchase, so it's shown as done rather than added twice.
  const putAway = await em.find(
    ShoppingItem,
    { checked: true, putAway: { $ne: null } },
    { fields: ["id", "name"], orderBy: { createdAt: "asc" } }
  )
  const claimed = new Set<string>()
  return lines.map((line) => {
    const key = keyOf(line.name)
    const isMatch = (item: { id: string; name: string }) => {
      if (claimed.has(item.id)) return false
      const theirs = keyOf(item.name)
      return (
        // Bought what's on the list, or a kind of it.
        covers(key, theirs) ||
        key.endsWith(` ${theirs}`) ||
        theirs.endsWith(` ${key}`)
      )
    }
    // Rows still to buy first; only a line with none left for it falls
    // back to a row that's already been put away.
    const unchecked = line.kind === "other" ? undefined : waiting.find(isMatch)
    const done =
      line.kind === "other" || unchecked ? undefined : putAway.find(isMatch)
    const match = unchecked ?? done
    if (match) claimed.add(match.id)
    return {
      ...line,
      listItem: match
        ? { id: match.id, name: match.name, putAway: match === done }
        : null,
    }
  })
}

/**
 * Receipts never looked over, and their files: gone after a day. A
 * receipt's uploads are in its folder too, so they go with it.
 */
async function forgetOld(
  em: EntityManager,
  files: FileStore,
  householdId: string
) {
  const old = await em.find(Receipt, {
    createdAt: { $lt: new Date(Date.now() - KEEP_MS) },
  })
  for (const receipt of old) {
    await files.remove(`receipts/${householdId}/${receipt.id}`)
    em.remove(receipt)
  }
}

/** What was read from a receipt, before anything is saved. */
export type ReceiptRead = {
  store: string | null
  date: string | null
  total: number | null
  lines: ReceiptLine[]
  /** The copies kept to look at while looking it over. */
  kept: { body: Buffer; mediaType: ReceiptFile["mediaType"] }[]
}

/**
 * Reads what came in, and says what it was: a receipt, a recipe (what's
 * shared to Merran may be one) or something else. Only a receipt with
 * lines has anything read; nothing is saved here.
 */
export async function readLines(
  em: EntityManager,
  deps: AiDeps,
  options: { householdId: string; userId: string | null; input: ReceiptInput }
): Promise<{ what: "receipt" | "recipe" | "other"; read: ReceiptRead | null }> {
  const { content, kept, needs } = await receiptContent(options.input)
  const { output } = await useAi(
    deps,
    em,
    {
      householdId: options.householdId,
      userId: options.userId,
      task: "receipts",
      needs,
    },
    (model) =>
      generateText({
        model,
        system: SYSTEM,
        messages: [{ role: "user", content }],
        output: Output.object({ schema: ReadReceipt, name: "receipt" }),
        maxOutputTokens: 8000,
      })
  )
  const items = output.items.filter((item) => item.name.trim())
  if (output.what !== "receipt" || items.length === 0) {
    return {
      what: output.what === "receipt" ? "other" : output.what,
      read: null,
    }
  }

  const lines = await matchList(
    em,
    items.slice(0, 300).map((item) => ({
      id: uuidv7().slice(-12),
      text: item.text.trim().slice(0, 200),
      name: item.name.trim().slice(0, 200),
      amount: item.amount?.trim().slice(0, 60) || null,
      price:
        item.price !== null && Number.isFinite(item.price) ? item.price : null,
      kind: item.kind,
    }))
  )
  const today = await householdToday(em, options.householdId)
  const date =
    output.date &&
    /^\d{4}-\d{2}-\d{2}$/.test(output.date) &&
    output.date <= today
      ? output.date
      : null
  return {
    what: "receipt",
    read: {
      store: output.store?.trim().slice(0, 120) || null,
      date,
      total:
        output.total !== null && Number.isFinite(output.total)
          ? output.total
          : null,
      lines,
      kept,
    },
  }
}

/** Puts what was read on a receipt, and its kept copies in the file store. */
async function keepRead(
  files: FileStore,
  receipt: Receipt,
  householdId: string,
  read: ReceiptRead
) {
  receipt.store = read.store
  receipt.date = read.date
  receipt.total = read.total
  receipt.lines = read.lines
  receipt.files = read.kept.map((file) => ({ mediaType: file.mediaType }))
  receipt.status = "ready"
  receipt.error = null
  await Promise.all(
    read.kept.map((file, index) =>
      files.put(fileKey(householdId, receipt.id, index), file.body)
    )
  )
}

/**
 * Reads a receipt into a draft to look over; nothing's added yet. Says
 * what it was, too: what's shared to Merran may be a recipe instead, which
 * isn't kept as a receipt. It's read here, within the request, for the
 * share sheet and the assistant, who answer with what they find.
 */
export async function readReceipt(
  em: EntityManager,
  deps: AiDeps & { files: FileStore },
  options: { householdId: string; userId: string | null; input: ReceiptInput }
): Promise<{
  what: "receipt" | "recipe" | "other"
  receipt: ReceiptView | null
}> {
  const { what, read } = await readLines(em, deps, options)
  if (!read) return { what, receipt: null }
  await forgetOld(em, deps.files, options.householdId)
  const receipt = em.create(Receipt, {
    household: options.householdId,
    user: options.userId
      ? em.getReference(User, options.userId, { wrapped: true })
      : null,
    lines: [],
    files: [],
  })
  await keepRead(deps.files, receipt, options.householdId, read)
  await em.flush()
  return { what: "receipt", receipt: describeReceipt(receipt) }
}

const READ_KIND = "pantry.readReceipt"

/** Where a scan's upload waits for its job: apart from the kept copies. */
const uploadKey = (householdId: string, receiptId: string, index: number) =>
  `receipts/${householdId}/${receiptId}/upload/${index}`

/**
 * Where a scan's pasted text waits for its job: with the uploads, so it
 * goes with them once the receipt's read, rather than staying in the job's
 * payload for the 30 days a job is kept.
 */
const pastedKey = (householdId: string, receiptId: string) =>
  `receipts/${householdId}/${receiptId}/upload/text`

/** What a receipt says when its read was stopped. */
const STOPPED = "It was stopped before it was read."

/** Merran is shutting down, so the job runs again next start. */
const shuttingDown = (signal: AbortSignal) =>
  signal.aborted &&
  signal.reason instanceof JobStopped &&
  signal.reason.why === "shutdown"

/** Someone stopped the job. */
const wasCancelled = (signal: AbortSignal) =>
  signal.aborted &&
  signal.reason instanceof JobStopped &&
  signal.reason.why === "cancelled"

const ReadPayload = z.object({
  receiptId: z.string(),
  userId: z.string().nullable(),
  /** Who scanned it, so what it changes says they did, not Merran. */
  actor: z.custom<Actor>(),
  /** Whether text was pasted; it's in the file store with the files. */
  pasted: z.boolean(),
  /** Each upload's type, in order. */
  types: z.array(z.string()),
})

/**
 * Reads a scanned receipt from its uploads and saves what it finds on the
 * receipt, then removes the uploads: not before, so a read cut off by a
 * restart finds them again. A receipt that was a recipe, or had none in
 * it, or couldn't be read is marked so, and an error that's the person's
 * to see is handed back as the result for a request still waiting.
 */
export const readReceiptJob: JobHandler = {
  kind: READ_KIND,
  // Cancelled before it started: nothing will read it, so it says so. Its
  // uploads go with the receipt, when it's discarded or forgotten.
  cancelledWaiting: async (em, job) => {
    const { receiptId } = ReadPayload.pick({ receiptId: true }).parse(
      job.payload
    )
    const receipt = await em.findOne(Receipt, { id: receiptId })
    if (receipt?.status !== "reading") return
    receipt.status = "failed"
    receipt.error = STOPPED
    await em.flush()
  },
  lane: "long",
  // Scanned, and waited on before handing over.
  waitedOn: true,
  area: "pantry",
  concurrency: 2,
  perHousehold: 2,
  changes: ["pantry"],
  async run({ em, householdId, payload, deps, signal }) {
    if (!householdId) throw new Error("Receipts need a household.")
    const { receiptId, userId, actor, pasted, types } =
      ReadPayload.parse(payload)
    const folder = `receipts/${householdId}/${receiptId}/upload`

    // The receipt as it is now: it may have been discarded while it was read.
    const current = () =>
      em.findOne(Receipt, { id: receiptId }, { refresh: true })

    const markAs = async (
      status: "recipe" | "none" | "failed",
      error: string | null
    ) => {
      const receipt = await current()
      if (receipt) {
        receipt.status = status
        receipt.error = error
        await em.flush()
      }
      await deps.files.remove(folder)
    }

    const readUploads = () =>
      Promise.all(
        types.map(async (type, index) => {
          const body = await deps.files.read(
            uploadKey(householdId, receiptId, index)
          )
          if (!body) {
            throw new AppError(
              "not_found",
              "file_not_found",
              "Merran lost the photos of that receipt. Scan it again."
            )
          }
          return { body, type }
        })
      )

    const readPasted = async () => {
      if (!pasted) return null
      const body = await deps.files.read(pastedKey(householdId, receiptId))
      if (!body) {
        throw new AppError(
          "not_found",
          "file_not_found",
          "Merran lost the text of that receipt. Paste it again."
        )
      }
      return body.toString("utf8")
    }

    return withActor(actor, async () => {
      const waiting = await current()
      // Discarded, or forgotten, before it was started.
      if (!waiting) {
        await deps.files.remove(folder)
        return { receiptId, status: "gone" }
      }
      // Already read: a run cut off just after saving.
      if (waiting.status !== "reading") {
        return { receiptId, status: waiting.status }
      }
      try {
        const { what, read } = await readLines(em, deps, {
          householdId,
          userId,
          input: { files: await readUploads(), text: await readPasted() },
        })
        if (!read) {
          const status = what === "recipe" ? "recipe" : "none"
          await markAs(status, null)
          return { receiptId, status }
        }
        const receipt = await current()
        if (!receipt) {
          await deps.files.remove(folder)
          return { receiptId, status: "gone" }
        }
        await keepRead(deps.files, receipt, householdId, read)
        await em.flush()
        // Only now: until it's saved, a restart reads it again from these.
        await deps.files.remove(folder)
        return {
          receiptId,
          store: read.store,
          lines: read.lines.length,
          status: "ready",
        }
      } catch (err) {
        if (err instanceof AppError) {
          await markAs("failed", err.message)
          return { ...failureOf(err), receiptId, status: "failed" }
        }
        // Merran shutting down: it runs again next start, with its uploads,
        // and isn't marked. A cancel or anything else won't be tried again,
        // so the receipt says so, rather than staying as reading.
        if (!shuttingDown(signal)) {
          await markAs(
            "failed",
            wasCancelled(signal)
              ? STOPPED
              : "That didn't work. Scan it again in a moment."
          )
        }
        throw err
      }
    })
  },
}

export type Scanned = { done: ReceiptView } | { started: ReceiptView }

const receiptGone = () =>
  new AppError(
    "not_found",
    "receipt_not_found",
    "That receipt isn't waiting any more. Scan it again."
  )

/** Removes a receipt, if it's still there, with everything it kept. */
async function forget(
  em: EntityManager,
  files: FileStore,
  householdId: string,
  receiptId: string
) {
  await em.nativeDelete(Receipt, { id: receiptId })
  await files.remove(`receipts/${householdId}/${receiptId}`)
}

/**
 * Scans a receipt: what's wrong with what was sent (nothing to read, too
 * many files, a PDF that's too big) fails here at once, with no receipt
 * or job made. Otherwise a receipt is made, reading, with its uploads
 * (the files, and any pasted text) kept for the job, which reads it while
 * the request waits. A receipt in
 * within the wait is answered as it is, ready; one that was a recipe or
 * had no receipt in it, or couldn't be read, is removed and fails as it
 * always did. One that takes longer is answered as reading, and the job
 * goes on in the background.
 */
export async function scanReceipt(
  em: EntityManager,
  deps: Pick<AppDeps, "jobs" | "files">,
  options: { householdId: string; userId: string | null; input: ReceiptInput },
  settings: { handoverMs?: number } = {}
): Promise<Scanned> {
  const { householdId, userId, input } = options
  checkInput(input)
  await forgetOld(em, deps.files, householdId)
  const receipt = em.create(Receipt, {
    household: householdId,
    user: userId ? em.getReference(User, userId, { wrapped: true }) : null,
    lines: [],
    files: [],
    status: "reading",
  })
  await em.flush()
  const receiptId = receipt.id
  try {
    const uploads = input.files.map((file, index) =>
      deps.files.put(uploadKey(householdId, receiptId, index), file.body)
    )
    if (input.text) {
      uploads.push(
        deps.files.put(
          pastedKey(householdId, receiptId),
          Buffer.from(input.text, "utf8")
        )
      )
    }
    await Promise.all(uploads)
  } catch (err) {
    await forget(em, deps.files, householdId, receiptId)
    throw err
  }
  const job = await enqueue(em, {
    kind: READ_KIND,
    householdId,
    payload: {
      receiptId,
      userId,
      actor: currentActor(),
      pasted: Boolean(input.text),
      types: input.files.map((file) => file.type),
    },
    createdBy: userId,
    key: `${READ_KIND}:${receiptId}`,
    maxAttempts: 1,
  })
  // Adding it woke the runner already, except where nothing listens (tests).
  deps.jobs.wake()

  let answer: Awaited<ReturnType<typeof waitThenHandOver>>
  try {
    answer = await waitThenHandOver(em, deps.jobs, job.id, {
      ms: settings.handoverMs ?? HANDOVER_MS,
    })
  } catch (err) {
    // The person is told why, so there's no receipt left to find.
    await forget(em, deps.files, householdId, receiptId)
    throw err
  }
  const now = await em.findOne(Receipt, { id: receiptId }, { refresh: true })
  // Discarded by someone else while it was read.
  if (!now) throw receiptGone()
  if ("started" in answer) return { started: describeReceipt(now) }
  if (now.status === "ready") return { done: describeReceipt(now) }
  await forget(em, deps.files, householdId, receiptId)
  if (now.status === "recipe") {
    throw new AppError(
      "unprocessable",
      "receipt_is_recipe",
      "That looks like a recipe, not a receipt."
    )
  }
  throw new AppError(
    "unprocessable",
    "not_a_receipt",
    "Merran couldn't find a receipt in that. Try a clearer photo, or paste its text."
  )
}

/**
 * The household's receipts of the last day, newest first, whatever became
 * of them: still being read, waiting for a look, or not read.
 */
export async function listReceipts(em: EntityManager) {
  const receipts = await em.find(
    Receipt,
    { createdAt: { $gte: new Date(Date.now() - KEEP_MS) } },
    { orderBy: { createdAt: "desc" } }
  )
  return receipts.map(describeReceipt)
}

/**
 * A receipt, whatever became of it: one still being read, or that wasn't
 * one, can be looked at and discarded. Adding is only for `ready` ones.
 */
export async function findReceipt(
  em: EntityManager,
  receiptId: string,
  options: { ready?: boolean } = {}
) {
  const receipt = UUID.test(receiptId)
    ? await em.findOne(Receipt, {
        id: receiptId,
        createdAt: { $gte: new Date(Date.now() - KEEP_MS) },
        ...(options.ready ? { status: "ready" as const } : {}),
      })
    : null
  if (!receipt) throw receiptGone()
  return receipt
}

/** One of a receipt's photos or PDFs, to compare with. */
export async function readReceiptFile(
  em: EntityManager,
  files: FileStore,
  options: { householdId: string; receiptId: string; index: number }
) {
  const receipt = await findReceipt(em, options.receiptId)
  const file = receipt.files[options.index]
  const body = file
    ? await files.read(fileKey(options.householdId, receipt.id, options.index))
    : null
  if (!file || !body) {
    throw new AppError("not_found", "file_not_found", "There's no such file.")
  }
  return { body, mediaType: file.mediaType }
}

/**
 * Forgets a receipt without adding anything. One still being read has its
 * read stopped too, so the model isn't asked (and paid) for a receipt
 * nobody wants: the receipt goes first, so the stopped job finds nothing
 * left to mark.
 */
export async function discardReceipt(
  em: EntityManager,
  deps: Pick<AppDeps, "jobs" | "files">,
  options: { householdId: string; receiptId: string }
) {
  const receipt = await findReceipt(em, options.receiptId)
  const reading = receipt.status === "reading"
  await em.remove(receipt).flush()
  if (reading) await stopRead(em, deps.jobs, options.householdId, receipt.id)
  await deps.files.remove(`receipts/${options.householdId}/${receipt.id}`)
}

/** Stops a receipt's read, if it's still waiting or running. */
async function stopRead(
  em: EntityManager,
  jobs: AppDeps["jobs"],
  householdId: string,
  receiptId: string
) {
  const job = await em.findOne(Job, {
    key: `${READ_KIND}:${receiptId}`,
    forHousehold: householdId,
    status: { $in: [...ACTIVE] },
  })
  if (job) await jobs.cancel(em, job)
}

/**
 * Puts the chosen lines in the pantry, as named and measured after a
 * look, and takes what they were bought for off the list. The receipt's
 * done with after.
 */
export async function addReceipt(
  em: EntityManager,
  files: FileStore,
  options: {
    householdId: string
    receiptId: string
    items: readonly { id: string; name: string; amount: string | null }[]
  }
) {
  const keyOf = await householdKeys(em)
  const { householdId } = options
  const result = await inHouseholdTransaction(em, householdId, async (tx) => {
    const receipt = await findReceipt(tx, options.receiptId, {
      ready: true,
    })
    const byId = new Map(receipt.lines.map((line) => [line.id, line]))
    const today = await householdToday(tx, householdId)
    let added = 0
    const offTheList: ShoppingItem[] = []
    for (const chosen of options.items) {
      const line = byId.get(chosen.id)
      const name = chosen.name.trim()
      if (!line || !name) continue
      byId.delete(chosen.id)
      const amount = readAmount(chosen.amount ?? "")
      const bought = line.listItem
        ? await tx.findOne(
            ShoppingItem,
            { id: line.listItem.id },
            { populate: ["aisle"] }
          )
        : null
      tx.create(Purchase, {
        household: householdId,
        foodKey: keyOf(name),
        name,
        quantity: amount.quantity,
        unit: amount.unit,
        amountText: amount.amountText,
        boughtOn: receipt.date ?? today,
      })
      const place = await placeFor(
        tx,
        householdId,
        {
          name,
          unit: amount.unit,
          ...(bought?.aisle ? { aisle: bought.aisle.getEntity() } : {}),
        },
        today
      )
      await store(tx, householdId, {
        name,
        quantity: amount.quantity,
        unit: amount.unit,
        amountText: amount.amountText,
        aisle: place.aisle,
        storedIn: place.storedIn,
        useBy: place.useBy,
        // A row already put away gave its meals their share then, so
        // buying it again is just more in the pantry.
        forMeals: (!line.listItem?.putAway && bought?.forMeals) || [],
      })
      // A put-away row stays: it's checked, and what it put away stays put.
      if (bought && !line.listItem?.putAway) {
        tx.remove(bought)
        offTheList.push(bought)
      }
      // So the next of the same food joins it.
      await tx.flush()
      added++
    }
    tx.remove(receipt)
    await tx.flush()
    await recordListChange(tx, householdId, offTheList, {
      removed: offTheList.length,
    })
    await recordPantryChange(tx, householdId, { added })
    return { added, offTheList: offTheList.length, receiptId: receipt.id }
  })
  await files.remove(`receipts/${householdId}/${result.receiptId}`)
  return { added: result.added, offTheList: result.offTheList }
}
