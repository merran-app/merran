import { ref, LockMode } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"
import type { AppDeps } from "../../core/context.ts"
import { AppError } from "../../core/errors.ts"
import {
  Household,
  HouseholdMember,
  InviteLink,
  Job,
  Secret,
} from "../../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../../database/scope.ts"
import {
  createInviteLink,
  type InviteRole,
} from "../../services/auth/invites.ts"
import { enqueue } from "../../services/jobs/jobs.ts"
import type { JobHandler } from "../../services/jobs/runner.ts"
import { emailConfiguration, sendEmail } from "./sender.ts"
import { invitationEmail } from "./templates.ts"

/** Account links must use an operator-selected origin, never request headers. */
export function invitationOrigin(publicUrl: string | undefined) {
  if (publicUrl) {
    const url = new URL(publicUrl)
    if (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/"
    )
      return url.origin
  }
  throw new AppError(
    "invalid",
    "email_public_url",
    "Set MERRAN_PUBLIC_URL to Merran's full address without a path, query or credentials before emailing invitations."
  )
}

export async function requireInvitationEmail(
  deps: Pick<AppDeps, "config" | "settings">
) {
  invitationOrigin(deps.config.publicUrl)
  if (!(await emailConfiguration(deps.settings)).on)
    throw new AppError(
      "invalid",
      "email_unavailable",
      "The server administrator needs to enable and configure email first."
    )
}

/** Serialize sends within a household so its quota and duplicate checks are atomic. */
async function lockHousehold(em: EntityManager, householdId: string) {
  await em.findOneOrFail(Household, householdId, {
    lockMode: LockMode.PESSIMISTIC_WRITE,
  })
  const recent = await em.count(Job, {
    kind: "email.invitation",
    forHousehold: householdId,
    createdAt: { $gt: new Date(Date.now() - 60 * 60_000) },
  })
  if (recent >= 20)
    throw new AppError(
      "rate_limited",
      "invite_email_limit",
      "This household has sent too many invitations. Try again in an hour."
    )
}

export async function queueInvitation(
  em: EntityManager,
  deps: Pick<AppDeps, "config" | "settings">,
  options: {
    householdId: string
    createdBy: string
    role: InviteRole
    email: string
  }
) {
  await requireInvitationEmail(deps)
  return em.transactional(async (tx) => {
    await lockHousehold(tx, options.householdId)
    const email = options.email.trim().toLowerCase()
    if (await tx.count(HouseholdMember, { user: { email } }))
      throw new AppError(
        "conflict",
        "already_member",
        "That address is already a member of this household."
      )
    if (
      await tx.count(InviteLink, {
        email,
        usedAt: null,
        expiresAt: { $gt: new Date() },
      })
    )
      throw new AppError(
        "conflict",
        "invite_pending",
        "An invitation to that address is already pending. Resend or cancel it instead."
      )
    const { invite, token } = await createInviteLink(tx, options)
    invite.email = email
    invite.deliveryToken = ref(tx.create(Secret, deps.settings.seal(token)))
    invite.queuedAt = new Date()
    const job = await enqueue(tx, {
      kind: "email.invitation",
      householdId: options.householdId,
      createdBy: options.createdBy,
      payload: { inviteId: invite.id },
      maxAttempts: 3,
    })
    invite.deliveryJob = ref(job)
    await tx.flush()
    return invite
  })
}

export async function resendInvitation(
  em: EntityManager,
  deps: Pick<AppDeps, "config" | "settings">,
  options: { householdId: string; createdBy: string; inviteId: string }
) {
  await requireInvitationEmail(deps)
  return em.transactional(async (tx) => {
    await lockHousehold(tx, options.householdId)
    const invite = await tx.findOne(
      InviteLink,
      {
        id: options.inviteId,
        email: { $ne: null },
        usedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { populate: ["deliveryJob"] }
    )
    if (!invite?.deliveryToken)
      throw new AppError(
        "not_found",
        "invite_not_found",
        "There's no pending email invitation to resend."
      )
    if (invite.queuedAt && invite.queuedAt.getTime() > Date.now() - 60_000)
      throw new AppError(
        "rate_limited",
        "invite_resend_wait",
        "Wait a minute before resending this invitation."
      )
    const previous = invite.deliveryJob?.getEntity()
    if (previous && ["queued", "running"].includes(previous.status))
      throw new AppError(
        "conflict",
        "invite_sending",
        "This invitation is already waiting to send."
      )
    invite.queuedAt = new Date()
    invite.sentAt = null
    invite.deliveryJob = ref(
      await enqueue(tx, {
        kind: "email.invitation",
        householdId: options.householdId,
        createdBy: options.createdBy,
        payload: { inviteId: invite.id },
        maxAttempts: 3,
      })
    )
    await tx.flush()
    return invite
  })
}

export const invitationEmailJob: JobHandler = {
  kind: "email.invitation",
  concurrency: 1,
  async run({ em, payload, householdId, jobId, signal, deps }) {
    if (!householdId || typeof payload.inviteId !== "string") return
    const invite = await em.findOne(
      InviteLink,
      { id: payload.inviteId, household: householdId },
      { populate: ["household", "deliveryToken"] }
    )
    // Cancellation, acceptance, expiry and newer sends all invalidate queued work.
    if (
      !invite?.email ||
      !invite.deliveryToken ||
      invite.usedAt ||
      invite.expiresAt <= new Date() ||
      invite.deliveryJob?.id !== jobId ||
      invite.sentAt ||
      signal.aborted
    )
      return
    const token = deps.settings.open(invite.deliveryToken.getEntity())
    const link = `${invitationOrigin(deps.config.publicUrl)}/join/${token}`
    const name = invite.household.getEntity().name.replace(/[\r\n]/g, " ")
    await sendEmail(deps.settings, {
      to: invite.email,
      ...invitationEmail({
        household: name,
        role: invite.role,
        email: invite.email,
        link,
        expiresAt: invite.expiresAt,
      }),
    })
    await em.nativeUpdate(
      InviteLink,
      { id: invite.id, deliveryJob: jobId, usedAt: null },
      { sentAt: new Date() }
    )
    return { accepted: true }
  },
}

/** Drop retained delivery secrets once their links can no longer be used. */
export async function clearExpiredInvitationTokens(em: EntityManager) {
  const invites = await em.find(
    InviteLink,
    { deliveryToken: { $ne: null }, expiresAt: { $lte: new Date() } },
    ACROSS_HOUSEHOLDS
  )
  for (const invite of invites) {
    const secretId = invite.deliveryToken!.id
    await em.nativeUpdate(
      InviteLink,
      { id: invite.id },
      { deliveryToken: null },
      ACROSS_HOUSEHOLDS
    )
    await em.nativeDelete(Secret, { id: secretId })
  }
}
