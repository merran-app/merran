// Compares a translation with the English file, for check-locales.mjs.
// Missing keys are warnings (i18next shows English for them); keys English
// doesn't have, placeholders that differ and plural forms a language
// doesn't use are errors. Kept apart from the command so it can be tested.

/** The plural endings i18next reads, from Intl.PluralRules' categories. */
const PLURAL = /_(zero|one|two|few|many|other)$/

/** The `{{placeholders}}` in a string, by name. */
const PLACEHOLDER = /\{\{\s*([\w.]+)[^}]*\}\}/g

/**
 * A locale file's contents, or why it isn't JSON.
 * @param {string} text
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
export function parseLocale(text) {
  try {
    const data = JSON.parse(text)
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, error: "It isn't a JSON object." }
    }
    return { ok: true, data }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Every string in a locale file, by its dot path: "recipes.count_one".
 * @param {object} object
 * @param {string} [prefix]
 * @returns {Map<string, string>}
 */
function flatten(object, prefix = "") {
  const strings = new Map()
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === "object") {
      for (const [inner, text] of flatten(value, path)) strings.set(inner, text)
    } else {
      strings.set(path, typeof value === "string" ? value : String(value))
    }
  }
  return strings
}

/**
 * Strings grouped as keys: a plural's forms are one key, named by its base
 * path. A plain key can share that name ("Servings" beside
 * "{{count}} servings"), so the two are kept apart, under different ids.
 * @param {Map<string, string>} strings
 * @returns {Map<string, { base: string, plural: boolean, forms: Map<string, string> }>}
 */
function group(strings) {
  const keys = new Map()
  for (const [path, text] of strings) {
    const form = PLURAL.exec(path)?.[1]
    const base = form ? path.slice(0, -form.length - 1) : path
    const id = form ? `${base} (plural)` : base
    const key = keys.get(id) ?? {
      base,
      plural: Boolean(form),
      forms: new Map(),
    }
    key.forms.set(form ?? "", text)
    keys.set(id, key)
  }
  return keys
}

/** @param {string} text */
const placeholdersIn = (text) =>
  new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]))

/** @param {Set<string>} a @param {Set<string>} b */
const sameSet = (a, b) =>
  a.size === b.size && [...a].every((name) => b.has(name))

/**
 * How a translation compares with English.
 * @param {{ english: object, translation: object, language: string }} options
 */
export function compareLocale({ english, translation, language }) {
  const englishKeys = group(flatten(english))
  const translatedKeys = group(flatten(translation))
  const needed = new Set(
    new Intl.PluralRules(language).resolvedOptions().pluralCategories
  )

  const missing = []
  const extra = []
  const placeholders = []
  const missingForms = []
  const extraForms = []
  let done = 0

  for (const [id, key] of englishKeys) {
    const { base } = key
    const theirs = translatedKeys.get(id)
    const filled = theirs
      ? [...theirs.forms.values()].some((text) => text.trim() !== "")
      : false
    if (!theirs || !filled) {
      missing.push(base)
      continue
    }
    done += 1

    const englishNames = new Set(
      [...key.forms.values()].flatMap((text) => [...placeholdersIn(text)])
    )
    if (!key.plural) {
      const text = theirs.forms.get("") ?? ""
      if (!sameSet(placeholdersIn(text), englishNames)) placeholders.push(base)
      continue
    }

    // A form may leave out {{count}}: "Une recette" says it without one.
    const expected = new Set(
      [...englishNames].filter((name) => name !== "count")
    )
    const differs = [...theirs.forms.values()].some((text) => {
      const names = placeholdersIn(text)
      names.delete("count")
      return !sameSet(names, expected)
    })
    if (differs) placeholders.push(base)

    for (const form of theirs.forms.keys()) {
      // i18next reads _zero for 0 in every language.
      if (form !== "zero" && !needed.has(form))
        extraForms.push(`${base}_${form}`)
    }
    for (const form of needed) {
      if (!theirs.forms.has(form)) missingForms.push(`${base}_${form}`)
    }
  }

  for (const [id, key] of translatedKeys) {
    if (!englishKeys.has(id)) extra.push(key.base)
  }

  return {
    percent: englishKeys.size
      ? Math.floor((done / englishKeys.size) * 100)
      : 100,
    missing,
    extra,
    placeholders,
    missingForms,
    extraForms,
  }
}

/**
 * A message for each language in the folder but not the list, or the list
 * but not the folder. English is both, always.
 * @param {string[]} fileCodes
 * @param {string[]} localeCodes
 * @returns {string[]}
 */
export function localeSetErrors(fileCodes, localeCodes) {
  const files = new Set(fileCodes)
  const listed = new Set(localeCodes)
  const errors = []
  for (const code of files) {
    if (code !== "en" && !listed.has(code)) {
      errors.push(`locales/${code}.json has no entry in LOCALES.`)
    }
  }
  for (const code of listed) {
    if (code !== "en" && !files.has(code)) {
      errors.push(`LOCALES has ${code}, but there's no locales/${code}.json.`)
    }
  }
  return errors
}
