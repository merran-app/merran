/** Emails stay self-contained: no remote images, fonts or tracking requests. */
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!
  )
}

function layout(options: {
  preview: string
  eyebrow: string
  title: string
  body: string
  footer: string
}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f3ec;color:#263b2b;-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(options.preview)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f3ec" style="width:100%;background-color:#f5f3ec;">
    <tr><td align="center" style="padding:40px 16px;">
      <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
        <tr><td style="padding:0 8px 24px;">
          <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:36px;font-weight:bold;letter-spacing:-1px;color:#315c3c;">merran<span style="color:#a65b3b;">.</span></p>
          <p style="margin:5px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#63685c;">Dinner, planned.</p>
        </td></tr>
        <tr><td bgcolor="#ffffff" style="padding:32px 24px;background-color:#ffffff;border:1px solid #dedfd4;border-top:4px solid #41734f;border-radius:12px;">
          <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#59714e;">${escapeHtml(options.eyebrow)}</p>
          <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:39px;font-weight:normal;letter-spacing:-0.6px;color:#263b2b;">${escapeHtml(options.title)}</h1>
          ${options.body}
        </td></tr>
        <tr><td style="padding:22px 8px 0;">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#63685c;">${escapeHtml(options.footer)}</p>
          <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#63685c;">Your recipes. Your kitchen. Your server.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`
}

const paragraph =
  "margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#4c5549;"

export function invitationEmail(options: {
  household: string
  role: "admin" | "member"
  email: string
  link: string
  expiresAt: Date
}) {
  const url = new URL(options.link)
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use an HTTP(S) invitation link without credentials")
  const household = escapeHtml(options.household)
  const link = escapeHtml(url.href)
  const email = escapeHtml(options.email)
  const expiry =
    new Intl.DateTimeFormat("en", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(options.expiresAt) + " UTC"
  return {
    subject: `Join ${options.household} on Merran`,
    text: `You've been invited to join ${options.household} on Merran with the ${options.role} role.\n\nJoin the household: ${options.link}\n\nUse ${options.email} to sign in or create your account. This single-use link expires ${expiry}.\n\nIf you weren't expecting this invitation, you can ignore it.`,
    html: layout({
      preview: `You're invited to ${options.household}. A little less planning. A little more dinner.`,
      eyebrow: "A place at the table",
      title: "Good food is better together.",
      body: `<p style="${paragraph}">You&rsquo;ve been invited to join <strong style="color:#263b2b;">${household}</strong> on Merran. Keep your recipes, plan the week, and share the shopping &mdash; all in one place.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;border:1px solid #e0e5d9;border-radius:8px;background-color:#f3f6ef;">
            <tr><td style="padding:16px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:23px;color:#4c5549;overflow-wrap:anywhere;word-break:break-word;">
              <strong style="color:#263b2b;">${household}</strong><br>
              Your role: ${options.role === "admin" ? "Admin" : "Member"}<br>
              Invited email: <strong>${email}</strong>
            </td></tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
            <tr><td align="center" bgcolor="#315c3c" style="border:1px solid #315c3c;border-radius:7px;mso-padding-alt:15px 24px;">
              <a href="${link}" style="display:inline-block;padding:15px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:7px;">Join the household&nbsp; &rarr;</a>
            </td></tr>
          </table>
          <p style="${paragraph}font-size:14px;line-height:23px;">Sign in or create an account with <strong>${email}</strong>. This invitation works once and expires ${escapeHtml(expiry)}.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-top:20px;border-top:1px solid #e7e8df;">
            <p style="margin:0 0 7px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#63685c;">Button not working? Copy this link into your browser:</p>
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;overflow-wrap:anywhere;word-break:break-all;"><a href="${link}" style="color:#315c3c;text-decoration:underline;">${link}</a></p>
          </td></tr></table>`,
      footer:
        "This invitation was sent by a household on a self-hosted Merran server. If you weren’t expecting it, you can ignore this email.",
    }),
  }
}

export function testEmail() {
  return {
    subject: "Merran test email",
    text: "Your Merran server can send email with these SMTP settings. This is a test message; no action is needed.",
    html: layout({
      preview: "A quick check of your Merran email connection.",
      eyebrow: "Connection check",
      title: "You’ve got good mail.",
      body: `<p style="${paragraph}">Your Merran server sent this test email using your saved email settings.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border:1px solid #e0e5d9;border-radius:8px;background-color:#f3f6ef;"><tr><td style="padding:18px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#315c3c;"><strong>Email connection, checked.</strong><br>If you&rsquo;re reading this in your inbox, the test reached you.</td></tr></table>
          <p style="${paragraph}margin-bottom:0;font-size:14px;line-height:23px;">There&rsquo;s nothing to click or confirm. You can head back to Merran.</p>`,
      footer:
        "You received this message because a server administrator requested an email test. No action is needed.",
    }),
  }
}

export function passwordResetEmail(options: { link: string; expiresAt: Date }) {
  const url = new URL(options.link)
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use an HTTP(S) reset link without credentials")
  const link = escapeHtml(url.href)
  const expiry =
    new Intl.DateTimeFormat("en", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(options.expiresAt) + " UTC"
  return {
    subject: "Reset your Merran password",
    text: `A password reset was requested for your Merran account.\n\nChoose a new password: ${options.link}\n\nThis link works once and expires ${expiry}. Changing your password signs out all existing sessions. If you didn't request this, ignore this email; your password has not changed.`,
    html: layout({
      preview:
        "Choose a new password for your Merran account. This link expires in 30 minutes.",
      eyebrow: "Account recovery",
      title: "Back to your kitchen.",
      body: `<p style="${paragraph}">A password reset was requested for your Merran account. Choose a new password to get back to your recipes and plans.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td bgcolor="#315c3c" style="border:1px solid #315c3c;border-radius:7px;mso-padding-alt:15px 24px;"><a href="${link}" style="display:inline-block;padding:15px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:7px;">Reset password&nbsp; &rarr;</a></td></tr></table>
          <p style="${paragraph}font-size:14px;line-height:23px;">This link works once and expires ${escapeHtml(expiry)}. Resetting your password signs out all your devices.</p>
          <p style="${paragraph}font-size:14px;line-height:23px;">Didn&rsquo;t ask for this? You can ignore this email. Your password hasn&rsquo;t changed.</p>
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;word-break:break-all;">Button not working? Copy this link:<br><a href="${link}" style="color:#315c3c;">${link}</a></p>`,
      footer:
        "Sent by your self-hosted Merran server. Never share this link or your password.",
    }),
  }
}
