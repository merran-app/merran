import { useTranslation } from "react-i18next"
import { SetupHelp } from "@/features/settings/setup-help"

const KEY_PAGES = {
  anthropic: "https://platform.claude.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  google: "https://aistudio.google.com/apikey",
} as const

export function ProviderSetup({
  provider,
}: {
  provider: keyof typeof KEY_PAGES | "openai-compatible"
}) {
  const { t } = useTranslation()
  const guidance = `ai.keys.setup.${provider}` as const
  return (
    <SetupHelp
      title={t(`${guidance}.title`)}
      steps={[t(`${guidance}.create`), t(`${guidance}.billing`)]}
      links={[
        ...(provider !== "openai-compatible"
          ? [
              {
                label: t(`ai.keys.setup.${provider}.button`),
                href: KEY_PAGES[provider],
              },
            ]
          : []),
        {
          label: t("ai.keys.setup.guide"),
          href: "https://merran.app/docs/run/ai-setup/",
        },
      ]}
    />
  )
}
