import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { TextField } from "@/components/form/text-field"
import { SelectField } from "@/components/form/select-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useCapability } from "@/features/capabilities/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { invitesQuery, type InviteLink } from "./queries"

export function EmailInviteDialog() {
  const { t } = useTranslation()
  const available = useCapability("email.invites")
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [email, setEmail] = React.useState("")
  const [role, setRole] = React.useState<InviteLink["role"]>("member")
  const [busy, setBusy] = React.useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await unwrap(
        api.POST("/api/households/current/invites/email", {
          body: { email: email.trim(), role },
        })
      )
      await queryClient.invalidateQueries({ queryKey: invitesQuery.queryKey })
      toast.success(t("settings.household.invites.emailQueued"))
      setOpen(false)
      setEmail("")
      setRole("member")
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next)
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        {t("settings.household.invites.emailInvite")}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-6">
          <DialogHeader>
            <DialogTitle>
              {t("settings.household.invites.emailInvite")}
            </DialogTitle>
            <DialogDescription>
              {t(
                available
                  ? "settings.household.invites.emailDescription"
                  : "settings.household.invites.emailUnavailable"
              )}
            </DialogDescription>
          </DialogHeader>
          {available && (
            <>
              <TextField
                label={t("auth.fields.email")}
                type="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                disabled={busy}
              />
              <SelectField
                label={t("settings.household.invites.role")}
                description={t("settings.household.invites.roleHint")}
                value={role}
                onChange={setRole}
                options={(["member", "admin"] as const).map((value) => ({
                  value,
                  label: t(`settings.household.roles.${value}`),
                }))}
              />
            </>
          )}
          <DialogFooter>
            <DialogClose
              disabled={busy}
              render={<Button type="button" variant="outline" />}
            >
              {t("common.cancel")}
            </DialogClose>
            {available && (
              <Button type="submit" disabled={busy}>
                {busy && <Spinner />}
                {t("settings.household.invites.emailInvite")}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
