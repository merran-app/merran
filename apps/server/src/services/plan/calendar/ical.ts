import { addDays, MEALS, mealTimes, type Meal } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  PlanEntry,
  PlanSlotTime,
  type Household,
} from "../../../database/entities/index.ts"
import { NOT_DELETED_FILTER } from "../../../database/scope.ts"
import { calendarInstant } from "./time.ts"

function escaped(text: string) {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replaceAll("\n", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
}

/** iCalendar content lines are folded by UTF-8 byte count, not JS length. */
function fold(line: string) {
  const chunks: string[] = []
  let chunk = ""
  let bytes = 0
  for (const point of line) {
    const size = Buffer.byteLength(point, "utf8")
    if (bytes + size > 75) {
      chunks.push(chunk)
      chunk = " "
      bytes = 1
    }
    chunk += point
    bytes += size
  }
  chunks.push(chunk)
  return chunks.join("\r\n")
}

function stamp(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
}

function displayName(entry: PlanEntry) {
  const recipe = entry.recipe?.getEntity()
  const variant = entry.variants?.find((value) => value.recipeId === recipe?.id)
  const main = variant?.name ?? recipe?.name ?? entry.note ?? "Meal"
  const side = entry.withRecipe?.getEntity()
  return side && !side.deletedAt ? `${main} + ${side.name}` : main
}

function recipeLinks(entry: PlanEntry, baseUrl: string) {
  const recipes = [entry.recipe?.getEntity(), entry.withRecipe?.getEntity()]
  return recipes
    .filter((recipe) => recipe && !recipe.deletedAt)
    .map((recipe) => `${recipe!.name}: ${baseUrl}/recipes/${recipe!.slug}`)
}

/** A pull subscription: all dated meals in a bounded window, current on fetch. */
export async function calendarFeed(
  em: EntityManager,
  household: Household,
  baseUrl: string,
  today: string
) {
  const from = addDays(today, -90)
  const to = addDays(today, 365)
  const [entries, overrides] = await Promise.all([
    em.find(
      PlanEntry,
      { date: { $gte: from, $lte: to }, anyDay: false },
      {
        populate: ["recipe", "withRecipe"],
        filters: { [NOT_DELETED_FILTER]: false },
      }
    ),
    em.find(PlanSlotTime, { date: { $gte: from, $lte: to } }),
  ])
  const slotTimes = new Map(
    overrides.map((slot) => [`${slot.date}:${slot.meal}`, slot])
  )
  const slots = new Map<string, PlanEntry[]>()
  for (const entry of entries) {
    if (entry.status === "skipped" || entry.recipe?.getEntity().deletedAt) {
      continue
    }
    const key = `${entry.date}:${entry.meal}`
    slots.set(key, [...(slots.get(key) ?? []), entry])
  }

  const settings = household.settings?.calendar
  if (!settings?.namespace) {
    throw new Error("The household calendar has no event namespace.")
  }
  const defaults = mealTimes(settings?.times)
  // Removing a dish leaves no row whose updatedAt could advance the slot.
  // Stamp the fresh feed so a polling client can notice that change too.
  const generatedAt = new Date()
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Merran//Meal Plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escaped(`Merran: ${household.name}`)}`,
  ]
  for (const [key, dishes] of [...slots].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const [day, mealName] = key.split(":") as [string, Meal]
    const meal = MEALS.find((value) => value === mealName)
    if (!meal) continue
    dishes.sort((a, b) => a.position - b.position)
    const time = slotTimes.get(key) ?? defaults[meal]
    const start = calendarInstant(day, time.start, household.timeZone)
    const end = new Date(start.getTime() + time.minutes * 60_000)
    const names = dishes.map(displayName)
    const label = meal.charAt(0).toUpperCase() + meal.slice(1)
    const short = `${label}: ${names.join(" + ")}`
    const summary =
      short.length <= 85 ? short : `${label}: ${names.length} dishes`
    const links = [
      ...new Set(dishes.flatMap((entry) => recipeLinks(entry, baseUrl))),
    ]
    const servings = dishes.flatMap((entry) =>
      entry.servings
        ? [`${displayName(entry)}: ${entry.servings} servings`]
        : []
    )
    const notes = dishes.flatMap((entry) =>
      entry.recipe && entry.note ? [entry.note] : []
    )
    const description = [
      names.join(" + "),
      ...servings,
      ...notes,
      ...links,
    ].join("\n")
    const url = `${baseUrl}/plan?week=${day}`
    lines.push(
      "BEGIN:VEVENT",
      `UID:${settings.namespace}-${day}-${meal}@merran`,
      `DTSTAMP:${stamp(generatedAt)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escaped(summary)}`,
      `DESCRIPTION:${escaped(description)}`,
      `URL:${url}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    )
  }
  lines.push("END:VCALENDAR")
  return lines.map(fold).join("\r\n") + "\r\n"
}
