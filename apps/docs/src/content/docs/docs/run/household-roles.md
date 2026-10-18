---
title: Household roles and permissions
description: Invite people, choose their access, and distinguish household roles from server administration.
sidebar:
  order: 3
---

Everyone signs in with their own account. A household shares recipes, plans, shopping lists, and pantry data. Your role applies to that household; belonging to another household does not grant access to this one.

## Before you begin

Sign in and switch to the household you intend to manage. Open **Settings → Household**. You need the **Owner** or **Admin** role to invite people or manage household settings. Server administration is a separate account role.

## Choose a role

| Capability                                                         | Member | Admin | Owner                 |
| ------------------------------------------------------------------ | ------ | ----- | --------------------- |
| Use and edit shared recipes, plans, lists, and pantry              | Yes    | Yes   | Yes                   |
| Change household tastes                                            | Yes    | Yes   | Yes                   |
| Change household details, theme nights, and administrator settings | No     | Yes   | Yes                   |
| Create or cancel invite links                                      | No     | Yes   | Yes                   |
| Promote or demote members and admins                               | No     | Yes   | Yes                   |
| Make or unmake an owner, or remove another owner                   | No     | No    | Yes                   |
| Import/export household data and inspect household import jobs     | No     | Yes   | Yes                   |
| Leave the household                                                | Yes    | Yes   | Unless the last owner |

There is no read-only household membership role. **Member** still permits everyday changes to shared kitchen data. Household AI credentials and settings are managed by owners/admins within the server's AI policy; see [AI setup](../ai-setup/).

## Invite someone

1. In **Settings → Household → Invite links** (**Invitations** in the unreleased email update), choose **Make a link**.
2. Choose **Member** or **Admin**, then **Make link**.
3. Copy the link immediately and send it privately to the intended person. The full link is shown only once.
4. Have them open the link and complete the join flow, then check **Members** for their account.

Each link works once and expires after seven days. Anyone holding it can use it. Use **Cancel** on an unused invite if it went to the wrong person, then make a new one. Owners are appointed after joining; an invite cannot directly grant ownership.

**Expected result:** the person appears in **Members** with the selected role and can access the shared household.

## Email an invitation (not released yet)

After the server administrator [configures Email and the public address](../configuration/#email-transport-not-released-yet), household owners and admins can use **Settings → Household → Invitations → Invite by email**. Enter **Email** and choose **Role**, then choose **Invite by email**. The invitation expires seven days after creation and can be accepted once, using the address it was sent to. New accounts have that address filled in; existing users sign in with the matching account. If another account is signed in, use **Sign out and use another account** on the join page. Opening the link does not join automatically: choose **Join** or **Make account and join**.

Invitation emails use a styled layout with a **Join the household** button, household and role, invited email and an expiry in UTC. If the button does not work, copy the URL below it. A plain-text version is included for mail readers that do not display HTML. No remote images or fonts need to load.

The list shows **Waiting to send**, **Sending**, **Accepted by mail service**, **Sending failed**, or **Sending cancelled**. Provider acceptance does not guarantee inbox delivery. Check spam and the provider dashboard if needed. Temporary failures retry automatically up to three attempts with increasing waits. **Resend email** is available after delivery finishes or fails; wait at least one minute between sends. Resending keeps the same link and original expiry. Each household can queue up to 20 emails or resends per hour.

**Cancel** invalidates the link and stops a waiting job from sending it. Mail already in flight cannot be recalled, but its cancelled link cannot be used. SMTP retries can occasionally produce duplicate messages after a connection loss; they contain the same single-use link. Expired invitations disappear from the pending list; create a new one if needed. Copyable links remain available when email is disabled. Invite recipients use the join link, never the server setup code. Password recovery and email verification are still planned.

## Change a role or remove someone

1. Open **Members** and find the person's account.
2. Use the role selector beside their name to change their role. Only owners see **Owner** as an option or can change another owner's role. The UI does not offer a role selector for your own account.
3. To remove a person, use their remove button and confirm **Remove**. To leave yourself, use **Leave** and confirm.

The household must always retain an owner. Before the final owner leaves, they must make another member an owner. Removing a membership leaves the person's account and the household's shared content in place; returning requires a new invitation.

## Server administrators

**Settings → This server** is restricted to server administrators. They manage server configuration, optional modules, shared AI policy, and server-wide jobs. Starting another household or importing an export as a new household also requires this role. Live Mealie migration requires both server-administrator and household-administrator access.

A server administrator's account does not automatically bypass household membership or owner checks. Household **Admin** does not grant access to **This server**. The person operating the server and its database still controls the underlying storage; household boundaries are application permissions, not protection from the server operator.

API keys have separate, route-specific permissions and cannot replace a browser session for administrator routes. Use the [API quickstart](../../api/) when creating an integration; do not treat an API key as an administrator login.

## Troubleshooting

| Symptom                                   | What to check                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| No role selector or invite controls       | Confirm the active household and your role. Members cannot administer it; you cannot change your own role in this screen. |
| “Only an owner can make or unmake owners” | Ask a current owner to perform the change.                                                                                |
| “Make someone else an owner first”        | Appoint another owner before removing or demoting the last one.                                                           |
| Invite fails                              | It may be used, cancelled, or expired. Ask an admin for a new link.                                                       |
| Invite points at the wrong address        | Have the server administrator check `MERRAN_PUBLIC_URL`, recreate the container, and create a new link.                   |
| “Only the household's admins can do that” | Server-admin status alone is insufficient; check your household role.                                                     |

## Next steps

Review [configuration](../configuration/) and the [generated settings reference](../settings-reference/). Before imports or server changes, make a [backup](../updating-and-backups/). For operational problems, use [troubleshooting](../troubleshooting/).
