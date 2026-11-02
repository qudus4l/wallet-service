# Wallet Service

A wallet service with user accounts, wallets and wallet-to-wallet transfers that stay correct under concurrent requests and cannot be executed twice. Admins can block and unblock users, maintain a blacklist, and fund wallets. A React web app, served by the same service, lets you try all of it in the browser.

**NestJS 12 · TypeScript · PostgreSQL 18 · TypeORM · React 19 · Render**

|                        |                                               |
| ---------------------- | --------------------------------------------- |
| **Web app**            | https://wallet-service-oxbp.onrender.com      |
| **API base**           | https://wallet-service-oxbp.onrender.com/v1   |
| **API docs (Swagger)** | https://wallet-service-oxbp.onrender.com/docs |
| **Design document**    | [`docs/DESIGN.md`](docs/DESIGN.md)            |
| **Decision records**   | [`docs/adr/`](docs/adr/README.md)             |

> **Free-tier notes for reviewers.** The service runs on Render's free plan: the first request after 15 idle minutes takes about a minute while the instance wakes up. The free database expires on **2026-12-01**, 30 days after creation (see [ADR-0007](docs/adr/0007-hosting-on-render-free-tier.md)).

## Try it in five minutes

1. Open the **[web app](https://wallet-service-oxbp.onrender.com)**. If it has been idle, give it about a minute to wake up.
2. **As a customer:** on the sign-in page press **Use customer** (demo account `ada@example.com`, password `wallet-demo`), or create your own account. Your naira wallet is created with the account.
   - A new wallet starts at ₦0.00, and only an admin can add funds. To fund your own account without admin access, sign in as Ada and send it some money, using your account's email as the recipient.
3. **As an admin:** press **Use admin** (`admin@example.com`) and enter the admin password from the submission email. The Admin area lets you:
   - **Users:** find any user, add funds to their wallet, block or unblock them. A blocked user is signed out at once.
   - **Blacklist:** list an email or phone number. It can no longer register, send or receive.
   - **Activity log:** every admin action, which can't be edited.
   - **Live tests:** two one-click tests that run against the live database:
     - **Double-spend:** 25 simultaneous ₦1.00 payments from a ₦10.00 wallet. Exactly 10 succeed and the balance stops at ₦0.00.
     - **Duplicate request:** the same payment sent 10 times at once. One payment; the other 9 get the original receipt.
4. **Send money:** as Ada, pay `bob@example.com` (or any customer) by email. The Review step shows the recipient's masked name before anything moves. Each payment carries one idempotency key, so a retry after a network error can't pay twice; the receipt says so if the server returned the original result.

Prefer the raw API? Use [Swagger](https://wallet-service-oxbp.onrender.com/docs) or the [curl walkthrough](#walkthrough) below.

---

## What it guarantees

| Guarantee                                      | How                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Balances are exact under parallel requests** | Each transfer runs in one database transaction that locks both wallets with `SELECT … FOR UPDATE`, always in ascending id order, so opposite-direction transfers cannot deadlock ([ADR-0004](docs/adr/0004-pessimistic-locking-for-transfers.md)).                                                                                                                           |
| **No negative balances**                       | Checked under the lock _and_ enforced by a database `CHECK` constraint.                                                                                                                                                                                                                                                                                                      |
| **A transfer executes at most once**           | A mandatory `Idempotency-Key` header is claimed inside the same transaction as the money movement. Retries return the original response with `Idempotent-Replayed: true`; the same key with a different body is rejected. A unique constraint on `(initiated_by, idempotency_key)` is a permanent backstop ([ADR-0005](docs/adr/0005-idempotency-and-replay-protection.md)). |
| **Every movement is auditable**                | Double-entry ledger: each transaction writes a DEBIT and a CREDIT with the resulting balance. Deposits come from a per-currency SYSTEM wallet, so the sum of all balances is always zero.                                                                                                                                                                                    |
| **Blocking is immediate**                      | The auth guard reloads the user on every request, so a blocked user's existing tokens stop working at once. Blocked users cannot log in, send or receive.                                                                                                                                                                                                                    |
| **Blacklist screening**                        | Email and phone are screened at registration and for **both** parties on every transfer. Callers get a generic error; the reason is never disclosed.                                                                                                                                                                                                                         |
| **Secure by default**                          | Every route requires a JWT unless explicitly public. Ownership is checked on every wallet and transaction (other users' wallets return 404), roles come from the database, passwords use argon2id, input validation rejects unknown fields, and responses never leak internals.                                                                                              |

All of these are covered by tests against a real PostgreSQL, including a concurrency suite. That suite fails if the row lock is removed (verified).

## API at a glance

All endpoints are under `/v1`. Amounts are **integers in minor units** (kobo: `150000` = ₦1,500.00).

| Method & path                                                    | Who                       |                                        |
| ---------------------------------------------------------------- | ------------------------- | -------------------------------------- |
| `POST /v1/auth/register`                                         | public                    | Create an account (and its NGN wallet) |
| `POST /v1/auth/login`                                            | public                    | Get a 15-minute access token           |
| `GET /v1/users/me`                                               | user                      | Your profile                           |
| `GET /v1/wallets`, `GET /v1/wallets/:id`                         | owner                     | Wallets and balances                   |
| `GET /v1/wallets/:id/transactions`                               | owner                     | Ledger history (cursor pagination)     |
| `POST /v1/transfers`                                             | user + `Idempotency-Key`  | Transfer between wallets               |
| `GET /v1/transfers/:id`                                          | sender or recipient       | A transaction                          |
| `POST /v1/admin/users/:id/block` · `/unblock`                    | admin                     | Block / unblock a user                 |
| `GET /v1/admin/users?email=`                                     | admin                     | Find users (with wallets)              |
| `POST/GET /v1/admin/blacklist`, `DELETE /v1/admin/blacklist/:id` | admin                     | Manage the blacklist                   |
| `GET /v1/admin/blacklist/check?type=EMAIL&value=`                | admin                     | Screen an identity                     |
| `POST /v1/admin/wallets/:id/deposits`                            | admin + `Idempotency-Key` | Fund a wallet                          |
| `GET /v1/admin/audit-logs`                                       | admin                     | Admin action history                   |
| `GET /health/live`, `GET /health/ready`                          | public                    | Liveness / readiness                   |

Errors always look like this, with a stable `code` you can branch on:

```json
{
  "error": { "code": "INSUFFICIENT_FUNDS", "message": "Insufficient funds in the source wallet" },
  "requestId": "…"
}
```

The full list of codes is in [DESIGN §5](docs/DESIGN.md#5-api).

### Walkthrough

```bash
API=http://localhost:3000   # or the live URL
RUN=$(date +%s)             # keeps the emails unique, so this can be run again

# 1. Two users. Each response includes the new wallet id.
GRACE_WALLET=$(curl -s -X POST $API/v1/auth/register -H 'Content-Type: application/json' \
  -d "{\"email\":\"grace-$RUN@example.com\",\"password\":\"correct-horse-1\",\"fullName\":\"Grace Hopper\"}" | jq -r '.wallets[0].id')
LINUS_WALLET=$(curl -s -X POST $API/v1/auth/register -H 'Content-Type: application/json' \
  -d "{\"email\":\"linus-$RUN@example.com\",\"password\":\"correct-horse-2\",\"fullName\":\"Linus Pauling\"}" | jq -r '.wallets[0].id')

# 2. Log in as the admin and fund Grace's wallet with ₦500.00
ADMIN=$(curl -s -X POST $API/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"<ADMIN_EMAIL>","password":"<ADMIN_PASSWORD>"}' | jq -r .accessToken)
curl -s -X POST $API/v1/admin/wallets/$GRACE_WALLET/deposits \
  -H "Authorization: Bearer $ADMIN" -H "Idempotency-Key: $(uuidgen)" \
  -H 'Content-Type: application/json' -d '{"amount":50000}'

# 3. Grace sends Linus ₦120.00. Run the transfer twice: the second call replays the first.
GRACE=$(curl -s -X POST $API/v1/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"grace-$RUN@example.com\",\"password\":\"correct-horse-1\"}" | jq -r .accessToken)
KEY=$(uuidgen)
curl -si -X POST $API/v1/transfers \
  -H "Authorization: Bearer $GRACE" -H "Idempotency-Key: $KEY" -H 'Content-Type: application/json' \
  -d "{\"sourceWalletId\":\"$GRACE_WALLET\",\"destinationWalletId\":\"$LINUS_WALLET\",\"amount\":12000}"

# 4. Grace's history
curl -s "$API/v1/wallets/$GRACE_WALLET/transactions?limit=10" -H "Authorization: Bearer $GRACE"
```

Or open `/docs`, click **Authorize**, and paste a token.

## Running locally

Requirements: **Node.js 24** and **Docker**.

```bash
cp .env.example .env          # local defaults; change JWT_SECRET and ADMIN_PASSWORD
docker compose up -d --wait   # PostgreSQL 18 on localhost:5434
npm ci
npm run migrate:dev           # apply migrations, create SYSTEM wallet and admin
npm run start:dev             # API on http://localhost:3000, docs at /docs

# Optional: demo customers Ada and Bob (password wallet-demo) with a short payment history.
# Goes through the API with fixed idempotency keys, so re-running is safe.
npm run build && ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=change-me-admin-password \
  npm run demo:seed -- http://localhost:3000

# Web app, in a second terminal (hot reload; proxies /v1 to the API)
npm ci --prefix web
npm run dev:web               # http://localhost:5173
```

In production the web app is built (`npm run build:web`) and served by NestJS from the same origin as the API. This means one URL and no CORS ([ADR-0008](docs/adr/0008-frontend-served-from-the-api.md)).

## Tests

```bash
npm test              # unit tests
npm run test:e2e      # integration + concurrency suites (starts PostgreSQL 18 in Docker)
npm run lint && npm run typecheck
```

The integration suites start a disposable PostgreSQL 18 container with [Testcontainers](https://testcontainers.com/), apply the real migrations, and drive the real application over HTTP. To use an existing database instead, set `TEST_DATABASE_URL` (its tables are truncated). If your Docker setup cannot pull the Testcontainers reaper image, set `TESTCONTAINERS_RYUK_DISABLED=true`.

The concurrency suite ([`test/concurrency`](test/concurrency/transfers.concurrency.e2e-spec.ts)) checks:

1. 100 parallel transfers of 1 from a balance of 50: exactly 50 succeed, 50 get `INSUFFICIENT_FUNDS`, final balance 0.
2. 50 A→B and 50 B→A transfers in parallel: all succeed, no deadlocks, totals conserved.
3. The same `Idempotency-Key` sent 20 times in parallel: one transaction row, 20 identical responses, 19 marked as replays.
4. The same key with different bodies at once: one succeeds, one gets `IDEMPOTENCY_KEY_REUSED`.
5. A 150-request storm of transfers and deposits across six wallets: money is conserved, nothing goes negative, no 5xx.
6. After every test, the ledger invariants hold: Σ balances = 0, each wallet's balance equals its ledger, and each transaction has exactly two balanced entries.

CI (GitHub Actions) runs format check, lint, typecheck, unit, integration and concurrency tests, and the build on every push. Render deploys only after CI passes.

## Deployment

Infrastructure is defined in [`render.yaml`](render.yaml) (a Render Blueprint): one free web service and one free PostgreSQL 18 database in Frankfurt, connected over Render's private network. The database accepts no public connections.

1. In Render: **New → Blueprint**, then select this repository.
2. When prompted, enter `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 12 characters). `JWT_SECRET` is generated by Render.
3. Each start runs migrations and the idempotent seed before the app boots. The free plan has no pre-deploy step; see [ADR-0007](docs/adr/0007-hosting-on-render-free-tier.md).
4. Optional: run `npm run demo:seed -- https://<your-service>.onrender.com` once (with the admin credentials in the environment) to create the public demo customers. Set `VITE_DEMO_ADMIN_EMAIL` on the service if the sign-in page's **Use admin** button should fill in the admin email; it never fills the password.

## Project layout

```
src/
  main.ts, app.module.ts, app.setup.ts   bootstrap and HTTP setup (shared with tests)
  config/                                env schema (zod), typed config
  database/                              entities, migrations, seed, pg error mapping
  common/                                decorators, error envelope, idempotency, pagination
  modules/
    auth/        register, login, JWT + roles guards, rate limiting
    users/       profile
    wallets/     balances, ledger history
    transfers/   the money-movement engine (transfers + deposits)
    compliance/  blacklist screening
    admin/       block/unblock, blacklist, deposits, audit log
    audit/       append-only audit trail
    health/      liveness / readiness
  scripts/migrate.ts                     migrations + seed (runs on start)
  web-app.ts                             serves the built web app from the same origin
web/                                     React 19 + Vite web app
  src/lib/          API client (error codes, idempotency keys), money in kobo, auth
  src/pages/        sign in/up, wallet dashboard + send money, admin (users,
                    blacklist, activity log, live tests)
test/
  unit/  e2e/  concurrency/
docs/
  DESIGN.md  adr/
```

## Trade-offs and next steps

Kept deliberately small for an assessment. Each item below is recorded with its trigger in [DESIGN §11](docs/DESIGN.md#11-scale-and-what-to-revisit).

- **No refresh tokens.** Users log in again after 15 minutes.
- **Admin deposits stand in for real funding rails.** Card and bank integrations would need pending states and webhooks.
- **Signup can still reveal that an account exists** (a single generic conflict code). Fully closing this needs email verification.
- **A single SYSTEM wallet per currency** serialises deposits. It can be sharded if deposit volume ever matters.
- **Free-tier hosting.** There are no backups, and the database expires. Changing `plan` in `render.yaml` upgrades in place.
