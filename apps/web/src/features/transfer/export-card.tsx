import { Download04Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { CardActions } from "@/features/settings/card-actions"

/** The household as a zip, to keep or to move to another Merran. */
export function ExportCard() {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.transfer.export.title")}</CardTitle>
        <CardDescription>
          {t("settings.transfer.export.description")}
        </CardDescription>
      </CardHeader>
      <CardActions>
        <Button
          variant="outline"
          render={<a href="/api/households/current/export" download />}
        >
          <HugeiconsIcon
            icon={Download04Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t("settings.transfer.export.download")}
        </Button>
      </CardActions>
    </Card>
  )
}
