# ADR-0003: TypeORM 1.x as ORM and migration tool

**Status:** Accepted · **Date:** 2026-11-01 · **Deciders:** Q

## Context

The ORM must support the transfer engine's critical requirement — **row-level pessimistic locks inside an explicit transaction** — be stable, maintainable, and integrate cleanly with NestJS. Data gathered from npm and GitHub on 2026-11-01.

## Decision

Use **TypeORM 1.x** via the official **`@nestjs/typeorm`** module, with versioned migrations and `synchronize: false`.

## Options considered

|                          | **TypeORM 1.1.2** ✅                                                                 | Prisma (client 7.10.1)                                                       | Drizzle (0.45.4)                                    |
| ------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| Row locks (`FOR UPDATE`) | Native: `setLock('pessimistic_write')`                                               | **Not in stable client** — only in v8 RC builds; otherwise raw `$queryRaw`   | Native: `.for('update')`                            |
| Release maturity         | 1.0 shipped May 2026; 1.1.x since                                                    | npm `latest` tag currently on **8.0.0-rc.29** — major transition in progress | Still 0.x; **1.0 in RC** (breaking changes pending) |
| Maintenance              | New maintainer team since late 2024: 575 PRs merged and 2,300+ issues closed in 2025 | Very active, VC-backed                                                       | Very active                                         |
| NestJS integration       | **Official** `@nestjs/typeorm` 12.x (peer: `typeorm ^1.0.0`)                         | Community / manual wiring                                                    | Community only                                      |
| Type safety              | Good for entities; weaker for query-builder results                                  | Excellent                                                                    | Excellent                                           |
| Migrations               | Versioned classes, plain SQL                                                         | Generated from Prisma schema DSL                                             | drizzle-kit                                         |
| Monthly downloads        | ~21M                                                                                 | ~76M                                                                         | ~117M                                               |

**TypeORM — pros:** the transfer path stays in the ORM (no untyped raw SQL where correctness matters most); transactions via `DataSource.transaction()`/`QueryRunner`; official Nest module; the `nestjs-best-practices` skill's patterns assume it.
**TypeORM — cons:** decorator-based entities; `bigint` returned as string (handled by a guarded transformer); history of a maintenance lapse (resolved since the 2024 handover).

**Prisma — pros:** best documentation and DX. **Cons:** the one feature we cannot compromise on (row locking) requires raw SQL in stable releases; extra schema language and generate step; mid-major-version churn.

**Drizzle — pros:** SQL-like, light, typed locks. **Cons:** pre-1.0 with a breaking 1.0 imminent — a maintenance liability for code reviewers will judge today; no official Nest module.

## Trade-off analysis

Prisma's DX advantage does not apply to the critical path because that path would be raw SQL. Drizzle is technically strong but pre-1.0. TypeORM is the only option that is simultaneously stable, lock-capable and officially integrated with NestJS.

## Consequences

- Easier: one consistent data-access style, including inside locked transactions; official Nest wiring.
- Harder: must write explicit migrations (we want that anyway); mind TypeORM's `bigint` → string behaviour.
- Revisit: Drizzle once 1.0 is stable, if type-safety of complex queries becomes a pain point.
