import { readFileSync, writeFileSync } from "node:fs"

// The app's contextual help and public glossary use the same wording.
const source = JSON.parse(
  readFileSync(
    new URL("../../web/src/locales/en.json", import.meta.url),
    "utf8"
  )
)
const body = `---
title: Glossary
description: The words Merran uses for planning, shopping and AI.
---

Open **Help** in Merran to look up these terms or choose **Show me around this page**.

${Object.values(source.help.terms)
  .map((term) => `## ${term.title}\n\n${term.description}`)
  .join("\n\n")}
`
const target = new URL(
  "../src/content/docs/docs/use/glossary.md",
  import.meta.url
)
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== body)
    throw new Error("Run pnpm --filter @merran/docs glossary:generate")
} else writeFileSync(target, body)
