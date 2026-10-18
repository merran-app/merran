import { expect, test } from "vitest"
import { invitationEmail, passwordResetEmail, testEmail } from "./templates.ts"

const invite = {
  household: "The Parkers",
  role: "member" as const,
  email: "jamie@example.com",
  link: "https://meals.example.com/join/sample-token",
  expiresAt: new Date("2026-10-25T18:30:00Z"),
}

test("password-reset mail has a clear action and the same expiring fragment link in both formats", () => {
  const link = "https://meals.example.com/reset-password#sample-token"
  const message = passwordResetEmail({ link, expiresAt: invite.expiresAt })
  for (const content of [message.html, message.text]) {
    expect(content).toContain(link)
    expect(content).toContain("October 25, 2026")
  }
  expect(message.html).toContain("Reset password")
  expect(message.text).toContain("signs out all existing sessions")
  expect(() =>
    passwordResetEmail({
      link: "javascript:alert(1)",
      expiresAt: invite.expiresAt,
    })
  ).toThrow()
})

test("HTML and text invitations contain the same action, recipient, role and expiry", () => {
  const message = invitationEmail(invite)
  for (const content of [message.html, message.text]) {
    expect(content).toContain(invite.link)
    expect(content).toContain(invite.email)
    expect(content).toContain("The Parkers")
    expect(content).toContain("October 25, 2026")
    expect(content).toContain("UTC")
  }
  expect(message.html).toContain("Join the household")
  expect(message.html).toContain("Your role: Member")
  expect(invitationEmail({ ...invite, role: "admin" }).html).toContain(
    "Your role: Admin"
  )
  expect(message.html).toContain(`href="${invite.link}"`)
})

test("household and recipient content is escaped in HTML, including the preview", () => {
  const message = invitationEmail({
    ...invite,
    household: '<img src="bad" onerror="alert(1)"> & friends',
    email: 'a"<b>@example.com',
  })
  expect(message.html).not.toContain("<img")
  expect(message.html).not.toContain("<b>")
  expect(message.html).toContain("&lt;img src=&quot;bad&quot;")
  expect(message.html).toContain("&amp; friends")
  expect(message.html).toContain("a&quot;&lt;b&gt;@example.com")
})

test("links escape HTML attribute characters and reject executable URLs or embedded credentials", () => {
  const message = invitationEmail({ ...invite, link: `${invite.link}?a=1&b=2` })
  expect(message.html).toContain(`href="${invite.link}?a=1&amp;b=2"`)
  for (const link of [
    "javascript:alert(1)",
    "data:text/html,test",
    "https://user:password@example.com/join/token",
  ]) {
    expect(() => invitationEmail({ ...invite, link })).toThrow()
  }
})

test("test mail has both formats and neither template loads remote assets", () => {
  const message = testEmail()
  expect(message.subject).toBe("Merran test email")
  expect(message.html).toContain("You’ve got good mail.")
  expect(message.text).toContain("no action is needed")
  for (const html of [message.html, invitationEmail(invite).html]) {
    expect(html).not.toMatch(/<script|<img|<link|@import|url\(/i)
    expect(html).toContain('lang="en"')
  }
})
