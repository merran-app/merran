import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, renameSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { areas, classify, changedPaths } from "./changes.mjs"
import { failures } from "./gate.mjs"

const selected = (paths) =>
  Object.entries(classify(paths))
    .filter(([, enabled]) => enabled)
    .map(([area]) => area)
    .sort()
for (const [paths, expected] of [
  [
    [
      "README.md",
      "docs/operations.md",
      "AGENTS.md",
      ".github/assets/merran-banner.svg",
    ],
    [],
  ],
  [["apps/docs/src/content/docs/docs/use/planning.md"], ["docs"]],
  [["apps/docs/astro.config.mjs"], ["docs"]],
  [["apps/web/src/features/recipes/card.tsx"], ["web", "image"]],
  [["apps/web/src/locales/en.json"], ["web", "image", "docs"]],
  [["apps/server/src/modules/recipes/service.ts"], ["server", "image", "docs"]],
  [
    ["apps/server/src/http/openapi/openapi.json"],
    ["server", "web", "extension", "image", "docs"],
  ],
  [["apps/extension/src/popup.tsx"], ["extension"]],
  [["apps/extension/src/lib/schema.d.ts"], ["extension", "web"]],
  [["apps/telemetry/src/index.ts"], ["telemetry"]],
  [["Dockerfile", "docker/entrypoint.sh", ".dockerignore"], ["image"]],
  [
    ["apps/docs/package.json", "apps/extension/wxt.config.ts"],
    ["docs", "extension"],
  ],
]) {
  test(`select checks for ${paths.join(", ")}`, () =>
    assert.deepEqual(selected(paths), expected.sort()))
}

for (const path of [
  "pnpm-lock.yaml",
  "package.json",
  "pnpm-workspace.yaml",
  ".nvmrc",
  ".npmrc",
  ".prettierrc",
  "tsconfig.base.json",
  ".github/workflows/ci.yml",
  ".github/actions/setup/action.yml",
  ".github/scripts/changes.mjs",
  "packages/shared/package.json",
  "packages/shared/src/units.ts",
  "apps/new-package/index.ts",
  "apps/web/src/index.css",
]) {
  test(`check everything for ${path}`, () =>
    assert.deepEqual(selected([path]), [...areas].sort()))
}

test("all paths are considered, even after 300 documentation files", () => {
  assert.deepEqual(
    selected([
      ...Array.from({ length: 400 }, (_, i) => `docs/${i}.md`),
      "apps/server/src/index.ts",
    ]),
    ["docs", "image", "server"]
  )
})

test("a missing base runs everything; malformed IDs fail closed", () => {
  assert.deepEqual(
    selected(changedPaths("0".repeat(40), "a".repeat(40), false)),
    [...areas].sort()
  )
  assert.throws(() => changedPaths("--bad-revision", "a".repeat(40), true))
})

test("Git diffs cover deletions, both rename paths, PR merge bases and push ranges", () => {
  const cwd = mkdtempSync(join(tmpdir(), "merran-ci-"))
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  const commit = () => {
    git("add", ".")
    git(
      "-c",
      "user.name=CI test",
      "-c",
      "user.email=ci@example.invalid",
      "commit",
      "-m",
      "fixture"
    )
    return git("rev-parse", "HEAD")
  }
  try {
    git("init")
    writeFileSync(join(cwd, "old.txt"), "renamed")
    writeFileSync(join(cwd, "removed.txt"), "deleted")
    const initial = commit()
    git("checkout", "-b", "feature")
    renameSync(join(cwd, "old.txt"), join(cwd, "new.txt"))
    rmSync(join(cwd, "removed.txt"))
    const head = commit()
    git("checkout", "--detach", initial)
    writeFileSync(join(cwd, "main-only.txt"), "base advanced")
    const base = commit()
    assert.deepEqual(changedPaths(base, head, true, cwd).sort(), [
      "new.txt",
      "old.txt",
      "removed.txt",
    ])
    assert.deepEqual(changedPaths(base, head, false, cwd).sort(), [
      "main-only.txt",
      "new.txt",
      "old.txt",
      "removed.txt",
    ])
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("the gate accepts successful required jobs and intentional skips", () => {
  assert.deepEqual(
    failures(
      { check: { result: "success" }, image: { result: "skipped" } },
      { check: true, image: false }
    ),
    []
  )
})
for (const result of ["failure", "cancelled", "skipped", undefined]) {
  test(`the gate rejects required jobs with result ${result}`, () => {
    assert.deepEqual(failures({ check: { result } }, { check: true }), [
      "check",
    ])
  })
}
test("unexpected runs and missing optional results fail the gate", () => {
  assert.deepEqual(
    failures({ image: { result: "success" } }, { image: false, docs: false }),
    ["image", "docs"]
  )
})
