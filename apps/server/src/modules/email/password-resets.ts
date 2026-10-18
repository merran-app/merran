import { createHash, randomBytes } from "node:crypto"
import { LockMode, raw, ref } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"
import { z } from "zod"
import type { AppDeps } from "../../core/context.ts"
import { AppError } from "../../core/errors.ts"
import {
  Account,
  PasswordReset,
  RateLimit,
  Secret,
  Session,
  User,
} from "../../database/entities/index.ts"
import { enqueue } from "../../services/jobs/jobs.ts"
import type { JobHandler } from "../../services/jobs/runner.ts"
import { invitationOrigin, requireInvitationEmail } from "./invitations.ts"
import { sendEmail } from "./sender.ts"
import { passwordResetEmail } from "./templates.ts"

const WINDOW_MS = 15 * 60_000
export const RESET_LIFETIME_MS = 30 * 60_000
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const version = (email: string, password: string) =>
  hash(JSON.stringify([email, password]))
const Delivery = z.object({
  email: z.email(),
  token: z.string().regex(/^[a-zA-Z0-9_-]{43}$/),
})

/** Persistent fixed-window counters. A conditional SQL increment admits at most the limit. */
export async function resetRateLimit(
  em: EntityManager,
  kind: string,
  value: string,
  limit: number
) {
  const now = Date.now()
  const key = `password-reset:${kind}:${hash(value)}:${Math.floor(now / WINDOW_MS)}`
  await em.upsert(
    RateLimit,
    { key, count: 0, lastRequest: now },
    { onConflictFields: ["key"], onConflictAction: "ignore" }
  )
  return (
    (await em.nativeUpdate(
      RateLimit,
      { key, count: { $lt: limit } },
      { count: raw("count + 1") }
    )) === 1
  )
}

/** Same work for every address: the worker, not the public request, looks up users. */
export async function requestPasswordReset(
  em: EntityManager,
  deps: Pick<AppDeps, "config" | "settings">,
  email: string
) {
  const address = email.trim().toLowerCase()
  if (!(await resetRateLimit(em, "email", address, 3))) return
  try {
    await requireInvitationEmail(deps)
  } catch {
    return
  }
  await em.transactional(async (tx) => {
    const token = randomBytes(32).toString("base64url")
    const reset = tx.create(PasswordReset, {
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + RESET_LIFETIME_MS),
      delivery: tx.create(
        Secret,
        deps.settings.seal(JSON.stringify({ email: address, token }))
      ),
    })
    await tx.flush()
    reset.job = ref(
      await enqueue(tx, {
        kind: "email.passwordReset",
        payload: { resetId: reset.id },
        maxAttempts: 3,
      })
    )
    await tx.flush()
  })
}

function invalidReset() {
  return new AppError(
    "invalid",
    "reset_invalid",
    "This reset link is invalid or has expired. Request a new one."
  )
}

async function removeDelivery(em: EntityManager, reset: PasswordReset) {
  const secretId = reset.delivery?.id
  if (!secretId) return
  reset.delivery = null
  await em.flush()
  await em.nativeDelete(Secret, { id: secretId })
}

export const passwordResetEmailJob: JobHandler = {
  kind: "email.passwordReset",
  concurrency: 1,
  async run({ em, payload, jobId, deps, signal }) {
    if (typeof payload.resetId !== "string") return
    const reset = await em.findOne(PasswordReset, payload.resetId, {
      populate: ["delivery"],
    })
    if (
      !reset ||
      !reset.delivery ||
      reset.usedAt ||
      reset.sentAt ||
      reset.expiresAt <= new Date() ||
      reset.job?.id !== jobId ||
      signal.aborted
    )
      return
    let delivery: z.infer<typeof Delivery>
    try {
      delivery = Delivery.parse(
        JSON.parse(deps.settings.open(reset.delivery.getEntity()))
      )
    } catch {
      throw new AppError(
        "internal",
        "reset_delivery_unreadable",
        "The password-reset email could not be prepared."
      )
    }
    const user = await em.findOne(User, { email: delivery.email })
    const account = user
      ? await em.findOne(Account, { user: user.id, providerId: "credential" })
      : null
    if (
      !user ||
      !account?.password ||
      (reset.credentialVersion &&
        reset.credentialVersion !== version(user.email, account.password))
    ) {
      reset.usedAt = new Date()
      await removeDelivery(em, reset)
      return { processed: true }
    }
    reset.user = ref(user)
    reset.credentialVersion = version(user.email, account.password)
    await em.flush()
    const link = `${invitationOrigin(deps.config.publicUrl)}/reset-password#${delivery.token}`
    await sendEmail(deps.settings, {
      to: user.email,
      ...passwordResetEmail({ link, expiresAt: reset.expiresAt }),
    })
    reset.sentAt = new Date()
    // Only the hash is needed after sending; retries after a saved acceptance skip delivery.
    await removeDelivery(em, reset)
    return { processed: true }
  },
}

/** Hash passwords through Better Auth, atomically claim the token, and revoke every session. */
export async function completePasswordReset(
  em: EntityManager,
  auth: AppDeps["auth"],
  token: string,
  password: string
) {
  if (password.length < 10 || password.length > 128)
    throw new AppError(
      "invalid",
      "password_length",
      "Use a password of 10 to 128 characters."
    )
  const reset = await em.findOne(PasswordReset, {
    tokenHash: hash(token),
    usedAt: null,
    expiresAt: { $gt: new Date() },
  })
  if (!reset?.user || !reset.credentialVersion) throw invalidReset()
  const passwordHash = await (await auth.$context).password.hash(password)
  await em.transactional(async (tx) => {
    const user = await tx.findOne(User, reset.user!.id, {
      lockMode: LockMode.PESSIMISTIC_WRITE,
      refresh: true,
    })
    if (!user) throw invalidReset()
    const account = await tx.findOne(
      Account,
      { user: user.id, providerId: "credential" },
      { refresh: true }
    )
    if (
      !account?.password ||
      reset.credentialVersion !== version(user.email, account.password)
    )
      throw invalidReset()
    const claimed = await tx.nativeUpdate(
      PasswordReset,
      { id: reset.id, usedAt: null, expiresAt: { $gt: new Date() } },
      { usedAt: new Date() }
    )
    if (!claimed) throw invalidReset()
    account.password = passwordHash
    await tx.nativeDelete(Session, { user: user.id })
    const pending = await tx.find(PasswordReset, {
      user: user.id,
      delivery: { $ne: null },
    })
    for (const item of pending) {
      item.usedAt = new Date()
      await removeDelivery(tx, item)
    }
  })
}

export async function cleanUpPasswordResets(em: EntityManager) {
  await em.transactional(async (tx) => {
    const expired = await tx.find(PasswordReset, {
      expiresAt: { $lte: new Date() },
    })
    for (const reset of expired) {
      await removeDelivery(tx, reset)
      tx.remove(reset)
    }
  })
  await em.nativeDelete(RateLimit, {
    key: { $like: "password-reset:%" },
    lastRequest: { $lt: Date.now() - WINDOW_MS * 2 },
  })
}
