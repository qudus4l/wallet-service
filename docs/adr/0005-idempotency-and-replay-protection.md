# ADR-0005: Database-backed idempotency keys for replay protection

**Status:** Accepted · **Date:** 2026-11-01 · **Deciders:** Q

## Context
The brief requires protection against duplicate or replayed transactions. Clients retry on timeouts; networks deliver duplicates; an attacker may resend a captured request. A transfer must execute at most once, and a legitimate retry must receive the original result.

## Decision
- `Idempotency-Key` header is **required** on every money-moving endpoint (`POST /v1/transfers`, admin deposits).
- Keys are scoped per user: `idempotency_keys PRIMARY KEY (user_id, key)` storing `request_hash`, `response_status`, `response_body`.
- The key is claimed with `INSERT … ON CONFLICT DO NOTHING` **inside the same transaction** as the money movement, and the response is written before commit.
  - Concurrent duplicate → blocks on the unique index until the first commits → returns the stored response (`Idempotent-Replayed: true`).
  - Same key, different payload → `422 IDEMPOTENCY_KEY_REUSED`.
  - Business-rule failure → whole transaction rolls back, key released (nothing moved, retry is evaluated fresh).
- Backstop: `transactions UNIQUE (initiated_by, idempotency_key)` — permanent, independent of any pruning.

## Options considered

### Option A: Postgres-backed keys in the same transaction ✅
| Dimension | Assessment |
|---|---|
| Correctness | Atomic with the money movement — no window where money moved but the key was not recorded (or vice versa) |
| Complexity | Low — one table, no extra infra |
| Concurrency | Unique index provides the mutual exclusion for in-flight duplicates; no "in progress" state needed |

### Option B: Redis `SETNX` keys with TTL
**Cons:** not atomic with the DB write; a crash between the two leaves them inconsistent; extra infrastructure.

### Option C: Separate "claim" transaction, then execute (Stripe-style state machine)
**Pros:** needed when the operation calls external systems. **Cons:** requires in-progress/recovery states; unnecessary because our entire operation is a single local DB transaction.

### Option D: HMAC-signed requests with timestamp + nonce
**Pros:** blocks replays even of never-before-seen keys within a window. **Cons:** client complexity, key distribution; aimed at server-to-server integrations. Recorded on the revisit list.

## Replay protection, layered
1. Mandatory idempotency key + permanent unique constraint → a replayed request can never move money twice.
2. 15-minute JWTs limit the window in which a captured request is usable at all.
3. TLS at Render's edge prevents capture in transit.

## Consequences
- Easier: safe client retries; demonstrable exactly-once behaviour in tests.
- Harder: clients must generate keys (documented; UUIDs recommended).
- Revisit: prune stored response bodies after N days; HMAC signing for server-to-server clients.
