import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { expect, test } from "vitest"
import { SetupCode } from "./setup-code.ts"

test("the operator file follows the active code and is removed after claiming", () => {
  const dir = mkdtempSync(join(tmpdir(), "merran-code-test-"))
  const file = join(dir, "setup-code")
  try {
    const code = new SetupCode(file)
    const first = code.issue()
    expect(code.check(readFileSync(file, "utf8"))).toBe(true)
    code.issue()
    expect(code.check(first)).toBe(false)
    expect(code.check(readFileSync(file, "utf8"))).toBe(true)
    code.retire()
    expect(existsSync(file)).toBe(false)
    expect(code.check(first)).toBe(false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
