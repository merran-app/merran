/** Which model and whose key a task uses, or why it can't run. */
type TaskStatus =
  | { ok: true; ref: string; source: "server" | "household" }
  | { ok: false; why: "noKey" | "notCovered" | "overLimit" | "ownLimit" }

/** As much of a household's AI status as says whether something can run. */
type AiStatus = {
  tasks: Partial<Record<string, TaskStatus>>
  vision: TaskStatus
}

/**
 * Whether the household can use AI for a task, and if not, why. Undefined
 * until it's known. `visual` is for photos and PDFs being imported, which
 * go to the household's model for those: the status says how an import
 * reads them.
 */
export function aiStatusFor(
  status: AiStatus | undefined,
  task: string,
  options: { visual?: boolean } = {}
) {
  const found = options.visual ? status?.vision : status?.tasks[task]
  return {
    ready: found?.ok,
    why: found && !found.ok ? found.why : null,
  }
}
