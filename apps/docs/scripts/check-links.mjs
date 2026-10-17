import { readdir, readFile, stat } from "node:fs/promises"
import { join, resolve } from "node:path"

const root = resolve("dist")
const base = (process.env.SITE_BASE || "/").replace(/\/?$/, "/")
const files = []
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await walk(path)
    else if (entry.name.endsWith(".html")) files.push(path)
  }
}
await walk(root)
const pages = new Map(
  await Promise.all(
    files.map(async (path) => [path, await readFile(path, "utf8")])
  )
)
const fragments = new Map(
  [...pages].map(([path, html]) => [
    path,
    new Set([...html.matchAll(/\bid=["']([^"']*)["']/g)].map((m) => m[1])),
  ])
)
const targets = new Map()
async function target(pathname) {
  if (targets.has(pathname)) return targets.get(pathname)
  let path = resolve(root, decodeURIComponent(pathname.slice(base.length)))
  try {
    if ((await stat(path)).isDirectory()) path = join(path, "index.html")
    await stat(path)
  } catch {
    path = null
  }
  targets.set(pathname, path)
  return path
}
const errors = []
let checked = 0
for (const [file, html] of pages) {
  const route =
    base +
    file
      .slice(root.length + 1)
      .replaceAll("\\", "/")
      .replace(/index\.html$/, "")
  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) {
    const value = match[1].replaceAll("&amp;", "&")
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) continue
    const url = new URL(
      value,
      "https://site.invalid/" + route.replace(/^\//, "")
    )
    if (!url.pathname.startsWith(base)) {
      errors.push(file + ": link escapes configured base: " + value)
      continue
    }
    const path = await target(url.pathname)
    if (!path) {
      errors.push(file + ": missing target " + value)
      continue
    }
    if (url.hash && fragments.has(path)) {
      const id = decodeURIComponent(url.hash.slice(1))
      if (id && !fragments.get(path).has(id))
        errors.push(file + ": missing fragment " + value)
    }
    checked++
  }
}
if (errors.length) {
  console.error(errors.join("\n"))
  process.exitCode = 1
} else {
  console.log(
    "Checked " +
      checked +
      " local links and assets across " +
      pages.size +
      " pages."
  )
}
