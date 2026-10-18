import nodemailer from "nodemailer"
import { AppError } from "../../core/errors.ts"
import type { Settings } from "../../services/settings/settings.ts"
import { EMAIL } from "./settings.ts"

/** Read current settings for each send so changes take effect without a restart. */
export async function emailConfiguration(settings: Settings) {
  const [enabled, host, port, security, username, password, from] =
    await Promise.all([
      settings.server(EMAIL.enabled),
      settings.server(EMAIL.host),
      settings.server(EMAIL.port),
      settings.server(EMAIL.security),
      settings.server(EMAIL.username),
      settings.server(EMAIL.password),
      settings.server(EMAIL.from),
    ])
  if (!enabled) return { on: false, needs: "disabled" } as const
  if (!host || !from) return { on: false, needs: "configuration" } as const
  if (Boolean(username) !== Boolean(password))
    return { on: false, needs: "credentials" } as const
  return { on: true, host, port, security, username, password, from } as const
}

/** Provider responses can contain credentials or message content, so keep errors plain. */
export async function sendEmail(
  settings: Settings,
  message: { to: string; subject: string; text: string; html?: string }
) {
  const config = await emailConfiguration(settings)
  if (!config.on)
    throw new AppError(
      "invalid",
      "email_unavailable",
      "Enable email and complete its SMTP settings first."
    )
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.security === "tls",
    requireTLS: config.security === "starttls",
    ...(config.username && config.password
      ? { auth: { user: config.username, pass: config.password } }
      : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    dnsTimeout: 10_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  })
  try {
    const result = await transport.sendMail({
      from: { name: "Merran", address: config.from },
      to: { address: message.to, name: "" },
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    })
    if (result.rejected.length || !result.accepted.length)
      throw new Error("Recipient refused")
  } catch {
    throw new AppError(
      "upstream",
      "email_send_failed",
      "The mail service did not accept the email. Check the SMTP settings, sender address and provider dashboard before trying again."
    )
  } finally {
    transport.close()
  }
}
