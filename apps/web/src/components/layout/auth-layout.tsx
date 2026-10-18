import type * as React from "react"

import { Logo } from "@/components/brand/logo"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/** The signed-out pages: setting up, signing in, joining. */
export function AuthLayout({
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  return (
    <div
      className={
        wide
          ? "flex min-h-svh flex-col items-center justify-center gap-3 px-4 py-4"
          : "flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-10"
      }
    >
      <Logo />
      <Card
        size={wide ? "sm" : "default"}
        className={wide ? "w-full max-w-3xl" : "w-full max-w-md"}
      >
        <CardHeader>
          <CardTitle className="font-heading text-2xl">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      {footer && <div className="text-sm text-muted-foreground">{footer}</div>}
    </div>
  )
}
