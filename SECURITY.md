# Security

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's private
vulnerability reporting instead — the **Report a vulnerability** button under this
repository's [Security tab](https://github.com/RecklessReef-ai/bosnian-support-schedule/security)
— which opens a report only the maintainer can read.

Expect an acknowledgement within a week. This is a small, volunteer-run project:
there is no bounty, and no guaranteed fix timeline.

## What is in scope

This site holds no accounts and no user data. It renders committed files and calls
no upstream service at request time, so the things worth reporting are:

- A way to make the scheduled workflows run attacker-controlled code, or to read the
  `API_FOOTBALL_KEY` secret.
- A dependency advisory that actually reaches code we ship.
- Personal data about a named person that has ended up in the repository or on the
  site and should not have. See `docs/adr/0005-marketing-moments-and-free-tier-listening.md`
  for the line this project draws.

## What is not

Fixture data being wrong or stale is a bug, not a vulnerability — open an ordinary
issue for it.
