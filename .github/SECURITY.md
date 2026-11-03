# Security

## Reporting a problem

Please report security problems privately, not in a public issue: [open a private report](https://github.com/merran-app/merran/security/advisories/new) on GitHub (the repository's **Security** tab, then **Report a vulnerability**). Only the maintainers see it.

Tell us what you can:

- Merran's version, and how it runs: Docker or from source, on SQLite or Postgres
- The steps that show the problem
- What someone could do with it, and who they'd need to be: anyone on the internet, a signed-in member of another household, or a member of the same household

## What happens next

- A reply within a few days, saying whether we can reproduce it and what happens next.
- A fix, released as soon as practical. The report stays private until then.
- A published security advisory once the fix is out, crediting you unless you'd rather not be named.

## Which versions get fixes

Security fixes go into the latest minor version. While Merran is in alpha, that's the newest release: update to it to get the fix.

## What's in scope

Anything in this repository: the server and the web app, the Docker image, the browser extension, the telemetry receiver at `telemetry.merran.app`, and the site at `merran.app`. For example:

- One household seeing or changing another's data
- Getting in without signing in, or doing more than a member's role allows
- Reading the keys Merran keeps encrypted, like an AI provider's
- Using an import to reach machines on the server's own network, other than ones the server admin set up, like their Mealie

Not in scope: someone with shell access to the server, or to its data folder, can read everything on it. A problem in one of Merran's dependencies belongs with that project, but tell us too if it affects Merran in a way an update alone won't fix.
