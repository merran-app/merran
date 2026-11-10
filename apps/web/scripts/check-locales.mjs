// Says how complete each translation is, against the English file.
// Run: pnpm --filter @merran/web check:locales   (exits 1 on any error)
// A language needs a file in src/locales and an entry in LOCALES
// (packages/shared/src/i18n/locales.ts); this fails if it has one and not
// the other. Missing keys are only warnings: i18next shows English.
import { readdirSync, readFileSync } from "node:fs"

import { LOCALES } from "../../../packages/shared/src/i18n/locales.ts"
import {
  compareLocale,
  localeSetErrors,
  parseLocale,
} from "./locales/compare.mjs"

const folder = new URL("../src/locales/", import.meta.url)
const files = readdirSync(folder).filter((name) => name.endsWith(".json"))
const codes = files.map((name) => name.slice(0, -".json".length))

let errors = localeSetErrors(
  codes,
  LOCALES.map((locale) => locale.code)
)
for (const message of errors) console.error(`Error: ${message}`)

/** A locale file's contents, or null after saying why it can't be read. */
function read(code) {
  const parsed = parseLocale(
    readFileSync(new URL(`${code}.json`, folder), "utf8")
  )
  if (parsed.ok) return parsed.data
  console.error(`Error: locales/${code}.json isn't valid JSON: ${parsed.error}`)
  errors = [...errors, code]
  return null
}

const english = read("en")
const others = codes.filter((code) => code !== "en")
if (english && others.length === 0) console.log("Only English so far.")

for (const code of english ? others : []) {
  const translation = read(code)
  if (!translation) continue
  const result = compareLocale({ english, translation, language: code })
  const problems = [
    ...result.extra.map((key) => `${key}: not in English`),
    ...result.placeholders.map(
      (key) => `${key}: placeholders differ from English`
    ),
    ...result.extraForms.map(
      (key) => `${key}: a plural form ${code} doesn't use`
    ),
  ]
  const warnings = [
    ...result.missing.map((key) => `${key}: not translated yet`),
    ...result.missingForms.map((key) => `${key}: a plural form ${code} needs`),
  ]
  console.log(
    `${code}  ${result.percent}% done  ${result.missing.length} missing  ${problems.length} errors`
  )
  for (const problem of problems) console.error(`  Error: ${problem}`)
  for (const warning of warnings) console.warn(`  Warning: ${warning}`)
  if (problems.length) errors = [...errors, code]
}

if (errors.length) process.exit(1)
