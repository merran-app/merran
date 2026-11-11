import { z } from "zod"
import {
  choiceSetting,
  listSetting,
  switchSetting,
} from "../../core/settings.ts"

/** Who may send webhooks to addresses on the home network. */
export const HOME_NETWORK = ["off", "all", "chosen"] as const

export const WEBHOOKS = {
  enabled: switchSetting({
    key: "webhooks.enabled",
    env: "MERRAN_WEBHOOKS",
    default: true,
    description:
      "Let households send webhooks to tools like Home Assistant and n8n when things happen. Off sends nothing and keeps their webhooks for later.",
  }),
  homeNetwork: choiceSetting({
    key: "webhooks.homeNetwork",
    env: "MERRAN_WEBHOOKS_HOME_NETWORK",
    choices: HOME_NETWORK,
    default: "off",
    description:
      "Whether webhooks may go to addresses on the home network, like Home Assistant's: off, for every household, or for the households chosen in Settings → Server. Off by default, because on a shared server it would let any household make Merran call machines on your network.",
  }),
  homeNetworkHouseholds: listSetting<string[]>({
    key: "webhooks.homeNetworkHouseholds",
    item: z.string().uuid(),
    default: [],
    description:
      "The households whose webhooks may go to the home network, when that's set to chosen.",
  }),
}
