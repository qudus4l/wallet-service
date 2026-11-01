# ADR-0002: PostgreSQL 18 as the database

**Status:** Accepted · **Date:** 2026-11-01 · **Deciders:** Q

## Context

The brief requires a SQL database. Money movement needs ACID transactions, reliable row-level locking, and constraints enforced by the database itself. Hosting is Render.

## Decision

Use **PostgreSQL 18** on Render Managed Postgres.

## Options considered

### Option A: PostgreSQL 18 ✅

| Dimension            | Assessment                                                                            |
| -------------------- | ------------------------------------------------------------------------------------- |
| Correctness features | `SELECT … FOR UPDATE`, `CHECK` constraints, partial unique indexes, transactional DDL |
| Hosting              | Native managed offering on Render (13–18 available; 18 is default)                    |
| Ecosystem            | First-class in every Node ORM; the default choice for ledgers                         |
| Cost                 | Free tier available (with limits, see ADR-0007)                                       |

**Pros:** transactional DDL makes migrations atomic; native `uuidv7()` in v18 gives time-ordered IDs without an extension; `jsonb` for stored idempotent responses; `lock_timeout` / `statement_timeout` per connection.
**Cons:** none material for this workload.

### Option B: MySQL 8

**Pros:** widely used, also supports `FOR UPDATE`. **Cons:** no managed MySQL on Render (would need a second provider); DDL is not transactional, so a failed migration can leave a half-applied schema; weaker `CHECK`/partial-index story.

## Consequences

- Easier: invariants (non-negative balance, unique idempotency key, valid enums) live in the schema, not just code.
- Harder: `postgresMajorVersion`, region, database name and user are **immutable** on Render once created; chosen up front (18, frankfurt).
- Revisit: read replicas / partitioning only at much larger scale.
