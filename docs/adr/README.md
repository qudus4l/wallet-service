# Architecture Decision Records

Format follows the `architecture` skill (Context → Decision → Options → Trade-offs → Consequences). All decided 2026-11-01.

| ADR                                               | Decision                                                        | Status   |
| ------------------------------------------------- | --------------------------------------------------------------- | -------- |
| [0001](0001-nestjs-on-node-24.md)                 | NestJS 12 on Node.js 24 LTS                                     | Accepted |
| [0002](0002-postgresql.md)                        | PostgreSQL 18 as the database                                   | Accepted |
| [0003](0003-typeorm.md)                           | TypeORM 1.x as ORM and migration tool                           | Accepted |
| [0004](0004-pessimistic-locking-for-transfers.md) | Pessimistic row locks with deterministic ordering for transfers | Accepted |
| [0005](0005-idempotency-and-replay-protection.md) | Database-backed idempotency keys for replay protection          | Accepted |
| [0006](0006-authentication-jwt-with-roles.md)     | User JWT authentication with an ADMIN role                      | Accepted |
| [0007](0007-hosting-on-render-free-tier.md)       | Render free tier via a Blueprint, migrations at boot            | Accepted |
| [0008](0008-frontend-served-from-the-api.md)      | React web app served by the API from the same origin            | Accepted |
