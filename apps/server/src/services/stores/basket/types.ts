import type { AppDeps } from "../../../core/context.ts"

export type BasketDeps = Pick<AppDeps, "settings" | "fetcher" | "ai">
