import { AUTH_SECURITY } from "./auth/settings.ts"
import type { AnySetting } from "../core/settings.ts"
import { AI } from "./ai/settings.ts"
import { EMAIL } from "./email/settings.ts"
import { ERROR_TRACKING } from "./error-tracking/settings.ts"
import { FLARESOLVERR } from "./flaresolverr/settings.ts"
import { NUTRITION } from "./nutrition/settings.ts"
import { PHOTOS } from "./photos/settings.ts"
import { SITES } from "./sites/settings.ts"
import { STORE_SETTINGS } from "./stores/settings.ts"
import { TELEMETRY } from "./telemetry/settings.ts"
import { UPDATES } from "./updates/settings.ts"
import { VIDEO } from "./video/settings.ts"
import { VOICE } from "./voice/settings.ts"

/**
 * Every module's settings, kept apart from the modules themselves so
 * startup can read them from the environment before anything else loads.
 * A module's settings go here and in its module.
 */
export const MODULE_SETTINGS: readonly AnySetting[] = [
  ...Object.values(AUTH_SECURITY),
  ...Object.values(AI),
  ...Object.values(EMAIL),
  ...Object.values(VIDEO),
  ...Object.values(NUTRITION),
  ...Object.values(SITES),
  ...Object.values(FLARESOLVERR),
  ...Object.values(PHOTOS),
  ...Object.values(VOICE),
  ...Object.values(STORE_SETTINGS),
  ...Object.values(ERROR_TRACKING),
  ...Object.values(TELEMETRY),
  ...Object.values(UPDATES),
]
