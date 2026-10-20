import type { Meal, MealTime } from "@merran/shared"
import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

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
import { api, ApiError, unwrap } from "@/lib/api/client"

/** A dated meal slot's time, shared by all its dishes. */
export function MealTimeDialog({
  date,
  meal,
  time,
  overridden,
}: {
  date: string
  meal: Meal
  time: MealTime
  overridden: boolean
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [start, setStart] = React.useState(time.start)
  const [minutes, setMinutes] = React.useState(time.minutes)
  const [busy, setBusy] = React.useState(false)
  const displayTime = new Date(
    `2000-01-01T${time.start}:00Z`
  ).toLocaleTimeString(i18n.language, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  })

  function changeOpen(next: boolean) {
    if (next) {
      setStart(time.start)
      setMinutes(time.minutes)
    }
    setOpen(next)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await unwrap(
        api.PUT("/api/plan/calendar/slots/{date}/{meal}", {
          params: { path: { date, meal } },
          body: { start, minutes },
        })
      )
      await queryClient.invalidateQueries({
        queryKey: ["plan", "calendar", "slots"],
      })
      setOpen(false)
      toast.success(t("plan.calendarTime.saved"))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    setBusy(true)
    try {
      await unwrap(
        api.DELETE("/api/plan/calendar/slots/{date}/{meal}", {
          params: { path: { date, meal } },
        })
      )
      await queryClient.invalidateQueries({
        queryKey: ["plan", "calendar", "slots"],
      })
      setOpen(false)
      toast.success(t("plan.calendarTime.resetDone"))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            className="h-6 px-1.5 text-xs text-muted-foreground"
            aria-label={t("plan.calendarTime.change", {
              meal: t(`plan.meals.${meal}`),
            })}
          />
        }
      >
        {displayTime}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("plan.calendarTime.title")}</DialogTitle>
          <DialogDescription>
            {t("plan.calendarTime.description", {
              meal: t(`plan.meals.${meal}`),
            })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void save(event)} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor={`meal-time-${date}-${meal}`}>
                {t("plan.calendarTime.start")}
              </FieldLabel>
              <Input
                id={`meal-time-${date}-${meal}`}
                type="time"
                required
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`meal-minutes-${date}-${meal}`}>
                {t("plan.calendarTime.minutes")}
              </FieldLabel>
              <Input
                id={`meal-minutes-${date}-${meal}`}
                type="number"
                min={15}
                max={240}
                required
                value={minutes}
                onChange={(event) => setMinutes(Number(event.target.value))}
              />
            </Field>
          </div>
          <DialogFooter>
            {overridden && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void reset()}
              >
                {t("plan.calendarTime.reset")}
              </Button>
            )}
            <Button type="submit" disabled={busy}>
              {t("plan.calendarTime.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
