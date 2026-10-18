import { z } from "zod"
import { jsonSetting, switchSetting, textSetting } from "../../core/settings.ts"

/** How the last summary went, for the Telemetry card. */
export const lastResultSchema = z.object({
  at: z.string(),
  /**
   * Sent; the receiver couldn't be reached; it refused the summary (a
   * mismatch the project needs to hear about); or it doesn't collect this
   * version's summaries any more.
   */
  outcome: z.enum(["sent", "unreachable", "refused", "retired"]),
  /** What the receiver said, when it refused. */
  detail: z.string().nullable(),
})
export type LastResult = z.infer<typeof lastResultSchema>

export const TELEMETRY = {
  enabled: switchSetting({
    key: "telemetry.enabled",
    env: "MERRAN_TELEMETRY",
    description:
      "Send the Merran project an anonymous summary once a day. `off` turns it off for good.",
    default: false,
  }),
  installId: textSetting({
    key: "telemetry.installId",
    internal: true,
    description:
      "A random id for this server, sent with the summary. Making a new one starts afresh.",
  }),
  asked: switchSetting({
    key: "telemetry.asked",
    internal: true,
    description:
      "Whether the server admin has answered the question about telemetry, asked once after setup.",
    default: false,
  }),
  reportedId: textSetting({
    key: "telemetry.reportedId",
    internal: true,
    description:
      "The install id the receiver last took a summary from, so it can be told to forget it after a new id or turning telemetry off.",
  }),
  lastResult: jsonSetting<LastResult | null>({
    key: "telemetry.lastResult",
    internal: true,
    description: "When the last summary was sent, or why it wasn't.",
    schema: lastResultSchema.nullable(),
    default: null,
  }),
}
