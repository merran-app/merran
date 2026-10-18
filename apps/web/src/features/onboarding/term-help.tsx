import { useTranslation } from "react-i18next"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import type { GLOSSARY_IDS } from "./tours"

/** Uses the same definitions as Help and the generated public glossary. */
export function TermHelp({ term }: { term: (typeof GLOSSARY_IDS)[number] }) {
  const { t } = useTranslation()
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("help.explain", {
              term: t(`help.terms.${term}.title`),
            })}
          />
        }
      >
        ⓘ
      </PopoverTrigger>
      <PopoverContent className="max-w-xs">
        <p className="font-semibold">{t(`help.terms.${term}.title`)}</p>
        <p className="text-sm">{t(`help.terms.${term}.description`)}</p>
      </PopoverContent>
    </Popover>
  )
}
