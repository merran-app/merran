// Expected jobs must succeed. Only jobs deliberately excluded by change
// detection (or the event type) may be skipped.
export function failures(results, expected) {
  return Object.entries(expected)
    .filter(([name, required]) => {
      const result = results[name]?.result
      return required ? result !== "success" : result !== "skipped"
    })
    .map(([name]) => name)
}

if (process.env.CI_GATE_RESULTS) {
  const failed = failures(
    JSON.parse(process.env.CI_GATE_RESULTS),
    JSON.parse(process.env.CI_GATE_EXPECTED)
  )
  if (failed.length) {
    console.error(`CI did not pass: ${failed.join(", ")}`)
    process.exitCode = 1
  }
}
