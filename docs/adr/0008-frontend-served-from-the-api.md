# ADR-0008: React web app served by the API from the same origin

**Status:** Accepted · **Date:** 2026-11-01 · **Deciders:** Q

## Context

Reviewers, including non-engineers, need to exercise every requirement (accounts, transfers, blacklist, block/unblock, concurrency and replay safety) without writing curl commands. The role is full-stack, and the service runs on Render's free plan.

## Decision

- A **React 19 + Vite + TypeScript** app in `web/`, with TanStack Query for server state and React Router for routes.
- **Built at deploy time and served by NestJS** (`src/web-app.ts`): static files are served as-is; browser page requests outside `/v1`, `/health` and `/docs` receive `index.html`. API paths always stay JSON.
- One backend addition for usability: **`GET /v1/wallets/resolve?email=`**, a name enquiry that returns the recipient's wallet id and a **masked** name (`"Ada L."`), so people pay by email rather than by wallet id.
- The client generates **one idempotency key per payment** and reuses it on retry, so a double click or flaky network can never pay twice. The UI surfaces replays.

## Options considered

|               | **Same origin** ✅        | Separate Render static site                                |
| ------------- | ------------------------- | ---------------------------------------------------------- |
| URLs to share | One                       | Two                                                        |
| CORS          | Not needed                | Needed (allow-list, preflights)                            |
| Cold start    | App and API wake together | Static site never sleeps, but the API behind it still does |
| Deploys       | One build, always in sync | Two services to keep in step                               |

**Rejected — server-side rendering (Next.js):** adds a second server runtime for an app with no SEO needs.

## Consequences

- Easier: one link for reviewers; no CORS surface; the frontend can't drift from the API version.
- Harder: the build installs a second dependency tree (removed after the build).
- Revisit: serve the frontend from a CDN if traffic or caching needs grow.
