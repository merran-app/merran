import assert from "node:assert/strict"
import { test } from "node:test"

import i18next from "i18next"

import { I18N_OPTIONS } from "./i18n-options.ts"

test("an empty translation shows English, as the completeness check says", async () => {
  const i18n = i18next.createInstance()
  await i18n.init({
    ...I18N_OPTIONS,
    lng: "pl",
    fallbackLng: "en",
    resources: {
      en: { translation: { save: "Save" } },
      pl: { translation: { save: "" } },
    },
  })
  // The app types t's keys from en.json; this instance has its own.
  const t = i18n.t as unknown as (key: string) => string
  assert.equal(t("save"), "Save")
})
