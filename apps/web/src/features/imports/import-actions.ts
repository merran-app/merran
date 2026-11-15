type Standing = {
  status: string
  added: number
  failed: number
  stopped: number
}

/** What can be done with an import as it stands: its page's buttons. */
export function importActions(found: Standing) {
  const going = found.status === "queued" || found.status === "running"
  const undone = found.status === "undone"
  const leftSomething =
    found.failed > 0 ||
    found.stopped > 0 ||
    found.status === "failed" ||
    found.status === "cancelled"
  return {
    stop: going,
    tryAgain: !going && !undone && leftSomething,
    // One still running is stopped first.
    undo: !undone && found.added > 0,
    restore: undone,
    deleteRecord: !going,
  }
}
