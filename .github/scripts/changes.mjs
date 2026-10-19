import { execFileSync } from "node:child_process"
import { appendFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

export const areas = [
  "server",
  "web",
  "extension",
  "shared",
  "telemetry",
  "docs",
  "image",
]

// Unknown paths deliberately run everything. New packages and build inputs must
// never silently escape CI just because this list has not caught up yet.
export function classify(paths) {
  const result = Object.fromEntries(areas.map((area) => [area, false]))
  const enable = (...names) =>
    names.forEach((name) => {
      result[name] = true
    })
  for (const path of paths) {
    if (
      path.startsWith("docs/") ||
      /^[^/]+\.md$/.test(path) ||
      path.startsWith(".github/assets/")
    )
      continue
    if (path.startsWith("apps/docs/")) enable("docs")
    else if (path.startsWith("apps/server/")) {
      enable("server", "image")
      // The site generator follows imports from server settings. Keep this
      // broad so moving a setting's helper cannot leave the reference stale.
      enable("docs")
      if (path === "apps/server/src/http/openapi/openapi.json")
        enable("web", "extension")
    } else if (path.startsWith("apps/web/")) {
      enable("web", "image")
      if (path === "apps/web/src/locales/en.json") enable("docs")
      // The root Prettier configuration reads this stylesheet for every package.
      if (path === "apps/web/src/index.css") enable(...areas)
    } else if (path.startsWith("apps/extension/")) {
      enable("extension")
      if (path === "apps/extension/src/lib/schema.d.ts") enable("web")
    } else if (path.startsWith("apps/telemetry/")) enable("telemetry")
    else if (path.startsWith("packages/shared/")) enable(...areas)
    else if (
      path === "Dockerfile" ||
      path === ".dockerignore" ||
      path.startsWith("docker/")
    )
      enable("image")
    else enable(...areas)
  }
  return result
}

export function changedPaths(base, head, pullRequest, cwd) {
  // Without a usable base (for example the first push), check everything.
  if (!base || /^0+$/.test(base)) return ["unknown-base"]
  if (!/^[a-f0-9]{40,64}$/.test(base) || !/^[a-f0-9]{40,64}$/.test(head)) {
    throw new Error("Expected full Git commit IDs")
  }
  const range = pullRequest ? `${base}...${head}` : `${base}..${head}`
  // --no-renames includes both old and new paths, including deletions. There
  // is no API pagination or 300-file workflow-filter limit here.
  return execFileSync(
    "git",
    ["diff", "--name-only", "--no-renames", "-z", range],
    {
      encoding: "utf8",
      cwd,
      maxBuffer: 32 * 1024 * 1024,
    }
  )
    .split("\0")
    .filter(Boolean)
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = classify(
    changedPaths(
      process.env.BASE_SHA,
      process.env.HEAD_SHA,
      process.env.EVENT_NAME === "pull_request"
    )
  )
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(result)
      .map(([key, value]) => `${key}=${value}\n`)
      .join("")
  )
  console.log(result)
}
