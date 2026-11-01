# ADR-0007: Render free tier via a Blueprint, migrations at boot

**Status:** Accepted · **Date:** 2026-11-01 · **Deciders:** Q

## Context

The brief requires hosting on Render with a live URL. This is a job assessment, so cost should be zero. Limits below were verified against Render's documentation (`/docs/free`, `/docs/compute-plans`) on 2026-11-01.

## Decision

- Infrastructure as code in **`render.yaml`** (Blueprint), validated with `render blueprints validate` before every push.
- Web service: `runtime: node`, `plan: free`, `region: frankfurt`, `healthCheckPath: /health/ready`, `autoDeployTrigger: checksPass`.
- Database: `plan: free`, `postgresMajorVersion: "18"`, `region: frankfurt`, `ipAllowList: []` (internal access only).
- **Migrations and admin seed run in the start command**: `node dist/scripts/migrate.js && node dist/main.js`.
- App connects via the **internal** connection string (`fromDatabase.connectionString`); no TLS needed on the private network.

## Options considered

### Option A: Free web + free Postgres ✅

**Pros:** zero cost; same Blueprint upgrades to paid plans by changing `plan`.
**Cons (free-tier limits):**

| Limit                                                                   | Mitigation                                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| No `preDeployCommand` (paid only)                                       | Run migrations at boot. Safe: single instance, additive migrations, TypeORM runs them in a transaction. |
| No shell / one-off jobs                                                 | Admin seeded idempotently at boot from env vars.                                                        |
| Postgres expires 30 days after creation, deleted after a 14-day grace   | Provision close to submission; README states the expiry date.                                           |
| Spin-down after 15 min idle, ~1 min cold start                          | Documented for reviewers; no keep-alive hacks.                                                          |
| Postgres: no backups, no managed PgBouncer, may restart for maintenance | Pool capped at 10 (`DB_POOL_MAX`); readiness check and retry logic.                                     |
| 0.1 CPU / 512 MB                                                        | argon2 parameters sized for it; no in-process caches.                                                   |

### Option B: Paid (web `0.5c-512mb` + Postgres `0.1c-256mb`)

**Pros:** pre-deploy migrations, no spin-down, no expiry, backups. **Cons:** cost not justified for an assessment.

### Option C: Docker runtime instead of native Node

**Pros:** identical image locally and in production. **Cons:** slower builds; the native Node runtime is simpler and sufficient. `runtime` is immutable after creation, so the choice is made now. Local Postgres still runs via docker-compose.

## Consequences

- Easier: one-click Blueprint deploy; deploys gated on green CI.
- Harder: the deployment's lifetime is bounded by the free database's 30-day expiry.
- Revisit: switch `plan` values to paid and move migrations to `preDeployCommand` if the service outlives the assessment.
