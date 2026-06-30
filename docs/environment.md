# Environment Setup

This project does not currently include real Supabase credentials. Do not create
or commit `.env.local` as part of documentation or code review.

## Future Required Variables

When Phase 3 is ready to connect to a real Supabase project, add these values
manually to a local `.env.local` file:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Optional server-only Google Chat delivery uses:

```text
GOOGLE_CHAT_WEBHOOK_URL=
```

When omitted, internal notifications continue normally and Google Chat delivery
is skipped. The webhook URL must only be configured in a protected server
environment and must never use a `NEXT_PUBLIC_` prefix.

## Safety Rules

- These values must be added manually later.
- Secrets and keys should not be committed.
- `.env.local` should remain local only.
- Do not paste real keys into docs, chat, tickets, screenshots, or code review
  comments.
- Do not add Supabase service-role keys to client-side environment variables.
- Keep production values in the deployment platform's protected environment
  settings.

## Current Behavior

The Supabase helper files read these environment variables, but the app does not
require them to typecheck or build. Middleware skips auth refresh when the
variables are missing and adds an internal `x-tytan-auth-mode` response header
with `supabase-env-missing` for developer visibility.

Real login, route enforcement, profile loading, and Row Level Security policies
are intentionally pending until credentials and migrations are approved.
