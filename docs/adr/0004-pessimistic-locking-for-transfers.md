# ADR-0004: Pessimistic row locks with deterministic ordering for transfers

**Status:** Accepted · **Date:** 2026-11-01 · **Deciders:** Q

## Context

Balances must remain accurate under parallel requests: no lost updates, no double-spends, no negative balances, and no deadlocks when transfers run in opposite directions (A→B while B→A).

## Decision

Inside one `READ COMMITTED` transaction, lock both wallets with
`SELECT … FROM wallets WHERE id IN ($a, $b) ORDER BY id FOR UPDATE`,
validate under the lock, then write balances and ledger entries. A DB `CHECK (balance >= 0)` backs the application check. Per-connection `lock_timeout=3s`, `statement_timeout=5s`, `idle_in_transaction_session_timeout=10s`. Retry `40P01`/`40001` up to 3× with jitter.

## Options considered

### Option A: Pessimistic locks, ordered by id ✅

| Dimension     | Assessment                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------- |
| Complexity    | Low — one locking query, explicit and easy to review                                        |
| Throughput    | Serialises only transfers touching the same wallet — the correct semantics                  |
| Failure modes | Deadlock-free by construction (consistent lock order); lock waits bounded by `lock_timeout` |

### Option B: Optimistic locking (version column + retry)

**Pros:** no lock waits when contention is low. **Cons:** a busy wallet is exactly where contention is high, producing retry storms and wasted work; more complex client-visible failure handling.

### Option C: `SERIALIZABLE` isolation for every transfer

**Pros:** strongest isolation without explicit locks. **Cons:** every conflict surfaces as a serialization failure that must be retried; harder to reason about than explicit locks; no extra safety here.

### Option D: Distributed lock in Redis

**Pros:** works across services. **Cons:** additional infrastructure and a second source of truth; the database must still be correct on its own.

### Option E: Single atomic `UPDATE … SET balance = balance - x WHERE balance >= x`

**Pros:** minimal. **Cons:** fine for the debit alone, but we also need both users' status, blacklist status and `balance_after` for the ledger under a consistent view — explicit locks are clearer.

## Trade-off analysis

Pessimistic locking is the standard choice for ledgers because correctness is simple to prove and the cost (serialising per wallet) matches the domain. Locks are always taken in ascending id order and the transaction is kept short, because debiting first without ordering locks can deadlock on opposite-direction transfers.

## Consequences

- Easier: provable invariants, testable with parallel requests against real Postgres.
- Harder: a single very hot wallet (e.g. the SYSTEM wallet) becomes a serial bottleneck.
- Revisit: shard hot SYSTEM wallets into sub-accounts if deposit throughput ever matters.
