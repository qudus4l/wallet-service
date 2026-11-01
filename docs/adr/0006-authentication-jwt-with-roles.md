# ADR-0006: User JWT authentication with an ADMIN role

**Status:** Accepted · **Date:** 2026-11-01 · **Deciders:** Q

## Context

Users create accounts and move _their own_ money; admins block/unblock users, manage the blacklist and fund wallets. The service must be secure by default. OWASP API Security Top 10 (2023) ranks Broken Object Level Authorization (API1) first and Broken Function Level Authorization (API5) among the top risks.

## Decision

- Users register and log in; login returns a **15-minute JWT** (HS256, `iss`/`aud` validated, claims limited to `sub` and `role`).
- A global **default-deny** guard authenticates every route; `@Public()` is the explicit opt-out.
- On every request the guard **reloads the user from the database**: `BLOCKED` → 403 immediately; the role used for authorization comes from the DB, not the token.
- `@Roles('ADMIN')` protects admin routes; ownership checks protect every wallet/transfer.
- Passwords hashed with **argon2id** (OWASP minimum m=19 MiB, t=2, p=1).
- The first admin is seeded idempotently at boot from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (Render free tier has no shell).

## Options considered

|                     | **User JWT + ADMIN role** ✅                                             | API keys only                                                 |
| ------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Fits the brief      | Yes — "user accounts" acting on their own wallets                        | Models a trusted internal caller that can move anyone's money |
| BOLA (API1)         | Enforced: caller identity is known, ownership checked on every object    | Cannot be demonstrated — the key is the service, not the user |
| BFLA (API5)         | Role check on admin routes                                               | Needs separate admin keys anyway                              |
| Revocation          | Short TTL + per-request DB status check (also implements instant block)  | Rotate/revoke keys; leaked key = full access                  |
| Maintenance         | Slightly more code (register/login/hash) — all first-party Nest packages | Less code                                                     |
| Reviewer experience | Register → "Authorize" in Swagger → test                                 | Reviewer must be issued a key                                 |

**Rejected — server-side sessions/cookies:** adds a session store and CSRF handling for an API that has no browser front-end.

## Skill alignment

Follows `nestjs-best-practices` → `security-auth-jwt` (short-lived tokens, issuer/audience, validate the user still exists and is active), `security-use-guards`, `security-rate-limiting` (stricter limits on `/auth/*`). **Deviation:** the skill recommends refresh tokens; omitted to avoid over-engineering for an assessment (users re-login after 15 min). Recorded on the revisit list.

## Consequences

- Easier: per-user authorization, immediate blocking, standard testing via Swagger.
- Harder: one DB lookup per authenticated request (primary-key read — negligible).
- Revisit: refresh tokens with rotation; API keys/HMAC for future server-to-server clients.
