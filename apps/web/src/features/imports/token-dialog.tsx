import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

/**
 * Try again for an import from Mealie through its API: its token isn't
 * kept, so it's asked for again. A drawer on a phone.
 */
export function TokenDialog({
  onToken,
}: {
  onToken: (token: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [token, setToken] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!token.trim()) return
    setBusy(true)
    try {
      await onToken(token.trim())
      setOpen(false)
      setToken("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        {t("imports.tryAgain")}
      </DialogTrigger>
      <DialogContent>
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t("imports.tokenTitle")}</DialogTitle>
            <DialogDescription>
              {t("imports.tokenDescription")}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="mealie-token">
              {t("imports.tokenLabel")}
            </FieldLabel>
            <Input
              id="mealie-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={busy || !token.trim()}>
              {busy && <Spinner data-icon="inline-start" />}
              {t("imports.tryAgain")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
