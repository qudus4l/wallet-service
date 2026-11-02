# ADR-0001: NestJS 12 on Node.js 24 LTS

**Status:** Accepted · **Date:** 2026-11-01 · **Deciders:** Q

## Context

The brief allows NestJS or Express on Node.js + TypeScript and asks for production-grade, clean code without over-engineering. A wallet needs consistent cross-cutting concerns: auth guards, validation, error mapping, logging, rate limiting.

## Decision

Use **NestJS 12** (Express adapter) on **Node.js 24 LTS**, compiled with `nest build` (tsc).

## Options considered

### Option A: NestJS 12 ✅

| Dimension            | Assessment                                                                          |
| -------------------- | ----------------------------------------------------------------------------------- |
| Complexity           | Medium — DI and decorators to learn, but conventions are fixed                      |
| Scalability          | Modular monolith that splits cleanly by feature module                              |
| Ecosystem            | First-party: `@nestjs/typeorm`, `jwt`, `throttler`, `terminus`, `swagger`, `config` |
| Reviewer familiarity | High — the most common structured Node framework                                    |

**Pros:** guards, pipes, filters and interceptors give one place for each cross-cutting concern; testing module for DI-based tests; structure reviewers recognise.
**Cons:** decorator-heavy; more boilerplate than Express for tiny services.

### Option B: Express

**Pros:** minimal, flexible. **Cons:** we would hand-build the same structure (validation, error handling, DI, module boundaries), which is the over-engineering the brief warns against, just in our own code.

## Runtime

Node 24 is the mature Active LTS (EOL April 2028). Node 26 entered LTS only on 2026-10-28; library support is still settling. NestJS 12 requires Node ≥ 20 and TypeORM 1.x supports `>=24.11.0`.

## Why there is a build step

Node's native type stripping needs no build step, but it only supports TC39 decorators and no `emitDecoratorMetadata`, while NestJS dependency injection depends on legacy decorators and metadata. So the code is compiled with `nest build`.

## Consequences

- Easier: consistent request pipeline, first-party integrations, conventional layout.
- Harder: build step required; decorators need `experimentalDecorators` + `emitDecoratorMetadata`.
- Revisit: Node 26 once it has a few LTS patch releases.
