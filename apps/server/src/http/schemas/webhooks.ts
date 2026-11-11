import { z } from "@hono/zod-openapi"
import { PICKABLE_WEBHOOK_EVENTS } from "@merran/shared"
import {
  DELIVERY_STATES,
  PAUSE_REASONS,
} from "../../database/entities/index.ts"
import { IDS, TIMES } from "./examples.ts"

const WEBHOOK = {
  id: IDS.webhook,
  name: "Home Assistant",
  host: "192.168.1.20:8123",
  events: ["recipe.created" as const],
  everything: false,
  headers: [],
  state: "working" as const,
  pausedReason: null,
  pausedAt: null,
  failingSince: null,
  lastError: null,
  lastDeliveredAt: TIMES.now,
  createdAt: TIMES.created,
}

const ADDRESS = "http://192.168.1.20:8123/api/webhook/merran-kitchen"

const SECRET = "whsec_GABmWOVDpDHcyCEkbbUEMKosvEGEC3mYhXOM7W4ZiDY="

/** The first delivery an admin usually sees: a test. */
const DELIVERY = {
  id: IDS.webhookDelivery,
  event: {
    id: `msg_${IDS.webhookEvent}`,
    type: "webhook.test",
    createdAt: TIMES.now,
  },
  state: "delivered" as const,
  tries: 1,
  statusCode: 200,
  answer: "",
  durationMs: 84,
  error: null,
  lastTriedAt: TIMES.now,
  deliveredAt: TIMES.now,
  body: JSON.stringify({
    type: "webhook.test",
    timestamp: TIMES.now,
    data: {
      household: { id: IDS.household, name: "The Riveras" },
      by: { id: IDS.sam, name: "Sam Rivera" },
      via: "app",
      key: null,
      webhook: { id: IDS.webhook, name: "Home Assistant" },
    },
  }),
}

export const WebhookSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    host: z.string().openapi({
      description:
        "Where it sends. The rest of the address is kept sealed, since it's often the receiver's password.",
    }),
    events: z.array(z.enum(PICKABLE_WEBHOOK_EVENTS)).openapi({
      description: "The events it's sent, unless it's sent everything.",
    }),
    everything: z.boolean().openapi({
      description: "Whether it's sent every event, including ones added later.",
    }),
    headers: z.array(z.string()).openapi({
      description:
        "The names of its extra headers. Their values are kept sealed and never shown.",
    }),
    state: z.enum(["working", "failing", "paused"]).openapi({
      description:
        "`failing` while a delivery is being tried again; `paused` when nothing is sent to it.",
    }),
    pausedReason: z.enum(PAUSE_REASONS).nullable().openapi({
      description:
        "Why it's paused: `gave_up` when a delivery ran out of tries, `gone` when its address answered 410 Gone, or `by_hand`.",
    }),
    pausedAt: z.iso.datetime().nullable(),
    failingSince: z.iso.datetime().nullable().openapi({
      description: "When its deliveries began failing in a row.",
    }),
    lastError: z.string().nullable().openapi({
      description: "Why its last delivery that failed did.",
    }),
    lastDeliveredAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi("Webhook", { example: WEBHOOK })

export const WebhookDetailSchema = WebhookSchema.extend({
  address: z
    .string()
    .openapi({ description: "The whole address it sends to." }),
}).openapi("WebhookDetail", { example: { ...WEBHOOK, address: ADDRESS } })

const NameSchema = z.string().trim().min(1, "Give it a name.").max(80)

const AddressSchema = z.string().trim().min(1, "Give its address.").openapi({
  description:
    "Where to send, `http` or `https`, with no user name or password in it: put those in a header. An address on the home network needs the server admin's leave.",
})

const EventsSchema = z
  .array(z.enum(PICKABLE_WEBHOOK_EVENTS))
  .max(PICKABLE_WEBHOOK_EVENTS.length)

const HeadersSchema = z
  .array(
    z.object({
      name: z
        .string()
        .regex(
          /^[A-Za-z0-9-]{1,64}$/,
          "Use up to 64 letters, digits and dashes."
        ),
      value: z.string().max(1_000),
    })
  )
  .max(5, "Use up to 5 headers.")
  .openapi({
    description:
      "Up to 5 headers sent with each delivery, like a token for n8n's Header Auth. They can't replace `content-type`, `content-length`, `host`, `user-agent` or the `webhook-` headers.",
  })

export const NewWebhookSchema = z
  .object({
    name: NameSchema,
    address: AddressSchema,
    events: EventsSchema.default([]).openapi({
      description: "The events to send. At least one, unless `everything`.",
    }),
    everything: z.boolean().default(false).openapi({
      description: "Send every event, including ones added later.",
    }),
    headers: HeadersSchema.default([]),
  })
  .openapi("NewWebhook", {
    example: {
      name: "Home Assistant",
      address: ADDRESS,
      events: ["recipe.created"],
      everything: false,
      headers: [],
    },
  })

export const WebhookChangesSchema = z
  .object({
    name: NameSchema.optional(),
    address: AddressSchema.optional(),
    events: EventsSchema.optional(),
    everything: z.boolean().optional(),
    headers: HeadersSchema.optional().openapi({
      description: "Replaces its extra headers; `[]` removes them.",
    }),
    paused: z.boolean().optional().openapi({
      description:
        "`true` pauses it: nothing new is sent, and what's waiting stops. `false` resumes it.",
    }),
    resend: z.boolean().optional().openapi({
      description:
        "With `paused: false`, also send again what didn't arrive in the last day.",
    }),
  })
  .openapi("WebhookChanges", { example: { paused: false, resend: true } })

export const WebhookCreatedSchema = z
  .object({
    webhook: WebhookSchema,
    secret: z.string().openapi({
      description:
        "The secret its deliveries are signed with, for the receiver to check them.",
    }),
  })
  .openapi("WebhookCreated", { example: { webhook: WEBHOOK, secret: SECRET } })

export const WebhookSecretSchema = z
  .object({ secret: z.string() })
  .openapi("WebhookSecret", { example: { secret: SECRET } })

export const DeliverySchema = z
  .object({
    id: z.string(),
    event: z.object({
      id: z.string().openapi({
        description:
          "The `webhook-id` header: the same on every try, so a receiver can drop repeats.",
      }),
      type: z.string().openapi({ example: "recipe.created" }),
      createdAt: z.iso.datetime().openapi({ description: "When it happened." }),
    }),
    state: z.enum(DELIVERY_STATES).openapi({
      description:
        "`waiting` to be tried, `delivered`, `failed` when it ran out of tries, or `stopped` when its webhook was paused.",
    }),
    tries: z.number(),
    statusCode: z.number().nullable().openapi({
      description:
        "What the last try was answered with; null when there was no answer.",
    }),
    answer: z.string().nullable().openapi({
      description: "The first 1,024 characters of the last answer.",
    }),
    durationMs: z.number().nullable().openapi({
      description: "How long the last try took.",
    }),
    error: z.string().nullable().openapi({
      description: "Why the last try failed.",
    }),
    lastTriedAt: z.iso.datetime().nullable(),
    deliveredAt: z.iso.datetime().nullable(),
    body: z.string().openapi({
      description: "Exactly what's sent, and signed.",
    }),
  })
  .openapi("WebhookDelivery", { example: DELIVERY })

export const DeliveryListSchema = z
  .object({
    deliveries: z.array(DeliverySchema),
    total: z.number().openapi({ description: "How many it has in all." }),
  })
  .openapi("WebhookDeliveryList", {
    example: { deliveries: [DELIVERY], total: 1 },
  })

export const DeliveryListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export const WebhookParam = z.object({
  webhookId: z.string().openapi({
    param: { name: "webhookId", in: "path" },
    example: IDS.webhook,
  }),
})

export const DeliveryParam = WebhookParam.extend({
  deliveryId: z.string().openapi({
    param: { name: "deliveryId", in: "path" },
    example: IDS.webhookDelivery,
  }),
})
