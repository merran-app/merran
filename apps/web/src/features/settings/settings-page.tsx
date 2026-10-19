import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

type SettingsGroup = {
  id: string
  title: string
  description: string
  content: ReactNode
}

/** The same wayfinding and section hierarchy at every level of settings. */
export function SettingsPage({ groups }: { groups: SettingsGroup[] }) {
  const { t } = useTranslation()

  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10">
      <nav
        aria-label={t("settings.onThisPage")}
        className="sticky top-14 z-10 -mx-4 min-w-0 border-b bg-background/95 px-4 py-2 backdrop-blur lg:top-20 lg:z-auto lg:mx-0 lg:self-start lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
      >
        <p className="sr-only mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:not-sr-only">
          {t("settings.onThisPage")}
        </p>
        <div className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {groups.map((group) => (
            <a
              key={group.id}
              href={`#${group.id}`}
              className="shrink-0 rounded-xl px-3 py-2 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none lg:whitespace-normal"
            >
              {group.title}
            </a>
          ))}
        </div>
      </nav>
      <div className="flex min-w-0 flex-col gap-12">
        {groups.map((group) => (
          <section
            key={group.id}
            id={group.id}
            aria-labelledby={`${group.id}-title`}
            className="scroll-mt-32 space-y-4 lg:scroll-mt-24"
          >
            <div className="space-y-1 border-b pb-4">
              <h2
                id={`${group.id}-title`}
                className="text-xl font-semibold tracking-tight"
              >
                {group.title}
              </h2>
              <p className="text-sm text-muted-foreground">
                {group.description}
              </p>
            </div>
            <div className="flex flex-col gap-4">{group.content}</div>
          </section>
        ))}
      </div>
    </div>
  )
}
