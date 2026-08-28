# Eagle Bank API

A REST API for a fictional bank, covering users, bank accounts, and transactions, built to the accompanying `openapi.yaml` spec and the take-home brief's Given/When/Then scenarios.

Node.js + Express 5 + TypeScript, Prisma ORM over SQLite, JWT auth.

## Setup

```bash
cp .env.example .env      # then edit JWT_SECRET to a real random value
npm install                # also runs `prisma generate` via postinstall
npx prisma migrate dev     # creates dev.db and applies the schema
npm run dev
```

Requires Node `>=22.6.0` (see `.nvmrc`): the `dev` script relies on Node's native TypeScript stripping rather than a separate build step.

## Running the tests

```bash
npm test              # full suite
npm run test:coverage # with coverage
npm run typecheck     # tsc, no emit
```

CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm test`, and `npm run typecheck` on every push and PR to `main`. The point is proving the suite passes against a clean checkout, not just on whichever machine last ran it locally.

## API surface

Full contract lives in [`openapi.yaml`](./openapi.yaml). At a glance:

| Resource | Endpoints |
|---|---|
| Auth | `POST /v1/auth/login` |
| Users | `POST /v1/users`, `GET/PATCH/DELETE /v1/users/:userId` |
| Accounts | `POST/GET /v1/accounts`, `GET/DELETE /v1/accounts/:accountNumber` |
| Transactions | `POST/GET /v1/accounts/:accountNumber/transactions`, `GET /v1/accounts/:accountNumber/transactions/:transactionId` |

All routes except user creation and login require a `Bearer` JWT obtained from login.

**Not implemented:** `PATCH /v1/accounts/{accountNumber}` (update a bank account), which is present in `openapi.yaml`. It's a straightforward extension of the same pattern already demonstrated on `PATCH /v1/users/:userId`, and was deliberately deprioritized in favor of making sure the Transactions resource (the newer, more involved piece) got full coverage within the time available. Every other endpoint in the spec is implemented.

## Design decisions worth flagging

A few judgment calls made while building this that aren't obvious from the diff alone:

- **Money is stored as integer pence** (`balancePence`, `amountPence`) throughout the data layer and service logic, and converted to pounds only at the API boundary (serializers, request parsing). This avoids floating-point drift on repeated balance arithmetic; it's the one thing about money handling that's non-negotiable regardless of time pressure.
- **Existence is checked before ownership everywhere** (a `404` for a resource that doesn't exist is returned before a `403` for one that exists but belongs to someone else). This matches the brief's scenarios as written, but it's worth naming the trade-off: an authenticated user can distinguish "doesn't exist" from "not yours" for any account or user ID, which is a mild enumeration surface. Chosen deliberately, not missed.
- **Deleting an account with existing transactions returns `409`**, and the same restriction is enforced at the database level (`onDelete: Restrict` on the `Account → Transaction` relation) as a second line of defence. This isn't in the given OpenAPI spec. It's an extension, added because the brief states transactions "can be retrieved but not modified or deleted," which implies the account underneath them can't simply disappear either. The corresponding `409` response block was added to `openapi.yaml` for the delete-account operation to keep the spec honest about what the API actually does.
- **The £10,000 balance cap is inclusive.** A deposit that lands exactly on £10,000 succeeds; anything that would exceed it is rejected with `422`. Withdrawals that would overdraw the account are rejected the same way.
- **Account number generation retries on collision.** A 6-digit random suffix has a real, if small, chance of colliding with an existing account; the create path retries up to 5 times before giving up with a clear error rather than assuming collisions can't happen.
- **`bcryptjs` over native `bcrypt`.** Pure JS, no native compilation step, chosen so cloning and running this doesn't depend on whoever's reviewing it having a working node-gyp toolchain.
- **Transaction creation is wrapped in a single Prisma `$transaction`**, re-reading the account's current balance inside the transaction rather than trusting a value read earlier in the request. This is what makes the balance check and the balance update atomic under concurrent requests against the same account.

## Known gaps / explicitly out of scope

- **No test touches a real database.** The entire suite mocks `src/lib/prisma.ts` at the module boundary. This proves the application code calls Prisma with the arguments it should; it does not prove the actual SQLite schema (the `accountNumber` unique constraint, the `onDelete: Restrict` relations) behaves the way the mocks assume. Given the scope and time available for this exercise, a real-database integration test was judged not worth adding; this is a stated trade-off, not an oversight.
- No pagination on `GET /v1/accounts` or the transactions list endpoints. Not required by the given scenarios, and out of scope at this data volume.

## Tech stack

Express 5, TypeScript, Prisma 5 + SQLite, Zod for request validation, JWT + bcryptjs for auth, Jest + Supertest + babel-jest for testing.
