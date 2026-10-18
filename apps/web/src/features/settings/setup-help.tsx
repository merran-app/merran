import { Link01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@/components/ui/button"

/** Keep provider registration beside the credentials it supplies. */
export function SetupHelp({
  title,
  steps,
  links,
}: {
  title: string
  steps: string[]
  links: Array<{ label: string; href: string }>
}) {
  return (
    <aside className="grid gap-3 rounded-2xl border bg-muted/30 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ol className="grid gap-2">
        {steps.map((step, index) => (
          <li
            key={step}
            className="flex items-start gap-2.5 text-sm text-muted-foreground"
          >
            <span
              aria-hidden
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground"
            >
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        {links.map(({ label, href }) => (
          <Button
            key={href}
            variant="outline"
            size="sm"
            className="h-auto min-h-8 text-left whitespace-normal"
            render={<a href={href} target="_blank" rel="noreferrer noopener" />}
          >
            {label}
            <HugeiconsIcon
              aria-hidden
              icon={Link01Icon}
              strokeWidth={2}
              className="size-3.5"
            />
          </Button>
        ))}
      </div>
    </aside>
  )
}
