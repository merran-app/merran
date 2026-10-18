import { z } from "zod"
import {
  choiceSetting,
  numberSetting,
  secretSetting,
  switchSetting,
  textSetting,
} from "../../core/settings.ts"

export const EMAIL = {
  enabled: switchSetting({
    key: "email.enabled",
    env: "MERRAN_EMAIL_ENABLED",
    default: false,
    description:
      "Allow Merran to send email through the server administrator's SMTP service. Off by default.",
  }),
  host: textSetting({
    key: "email.host",
    env: "MERRAN_SMTP_HOST",
    description:
      "SMTP hostname, such as smtp.resend.com. Private mail relays are allowed; only the server administrator can configure this.",
    schema: z
      .string()
      .trim()
      .min(1)
      .max(253)
      .regex(
        /^[a-z0-9._:-]+$/i,
        "Use a hostname or IP address, without a URL or port"
      ),
  }),
  port: numberSetting({
    key: "email.port",
    env: "MERRAN_SMTP_PORT",
    default: 587,
    schema: z.number().int().min(1).max(65535),
    description: "SMTP port: usually 587 with STARTTLS or 465 with TLS.",
  }),
  security: choiceSetting({
    key: "email.security",
    env: "MERRAN_SMTP_SECURITY",
    choices: ["starttls", "tls"],
    default: "starttls",
    description:
      "Require STARTTLS (usually port 587), or TLS from the start (usually port 465). Certificates are always checked.",
  }),
  username: textSetting({
    key: "email.username",
    env: "MERRAN_SMTP_USERNAME",
    description:
      "SMTP username. Leave both username and password unset for a trusted relay without authentication.",
  }),
  password: secretSetting({
    key: "email.password",
    env: "MERRAN_SMTP_PASSWORD",
    description:
      "SMTP password or provider API key. Stored encrypted and never returned by the API.",
  }),
  from: textSetting({
    key: "email.from",
    env: "MERRAN_EMAIL_FROM",
    schema: z.email().max(320),
    description:
      "Sender email address allowed by the SMTP provider, such as invites@example.com. Messages use Merran as the sender name.",
  }),
}
