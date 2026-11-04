# Tokenaires backend

The API behind the Tokenaires rich list. It signs developers in with GitHub, takes signed usage uploads from the CLI, checks every record, and serves the boards and profiles.

NestJS 11, PostgreSQL, Drizzle ORM. Shared API contracts live in `packages/contracts` (`@tokenaires/contracts`).

## Setup

```sh
pnpm install
cp .env.example .env
createdb tokenaires
pnpm db:migrate
pnpm start:dev
```

The API runs on http://localhost:7020/api/v1.

`AUTH_DEV_LOGIN=true` swaps GitHub for a local approval link so the CLI can sign in without an OAuth app. It refuses to start with `NODE_ENV=production`. For real sign-in, set `GITHUB_CLIENT_ID` to the Client ID of the Tokenaires GitHub OAuth App (device flow enabled, under appdever01's developer settings). Device flow needs no client secret, and the GitHub token is used once to read the public profile and never stored.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm start:dev` | Watch mode |
| `pnpm build` / `pnpm start:prod` | Build and run `dist/main.js` |
| `pnpm db:generate` | Generate a migration from the schema |
| `pnpm db:migrate` | Apply migrations in `drizzle/` |
| `pnpm test` | Unit tests |
| `pnpm smoke` | End to end checks against a running API with dev login (use a throwaway database) |
| `pnpm typecheck` / `pnpm lint` | TypeScript and ESLint |
| `pnpm review list` / `clear <handle>` / `spike <handle> [--apply]` | List accounts under review, clear one, or zero a flagged spike and then clear it. Needs `DATABASE_URL` |
| `pnpm review:prod <same arguments>` | Runs `review` against production through an SSH tunnel to the database container (`TOKENAIRES_SSH_HOST`, default `srv628842`). Nothing is exposed publicly and changes are live |

## API

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /auth/device/start` | none | Start device sign-in |
| `POST /auth/device/poll` | none | Finish sign-in and register the device's Ed25519 key |
| `POST /usage/batches` | token + signature | Upload up to 2,000 usage records |
| `GET /me` | token | Rank, tier and sync cursors for the CLI |
| `GET /boards?period=all\|month\|week&source=all\|claude-code\|codex&page=1` | none | A page of the board |
| `GET /stats` | none | Developers and token totals |
| `GET /users/:handle` | none | Public profile |
| `GET /health` | none | Liveness |

## Upload checks

- Uploads carry the device token and an Ed25519 signature over `timestamp.sha256(body)`. Timestamps older than five minutes and reused signatures are refused.
- The server computes all totals from raw records. Totals in requests are not accepted.
- `(source, recordId)` is globally unique. A record already owned by another account is refused, both accounts get a flag, and the uploader goes under review.
- Records are refused for a malformed ID, a future time, a time before the tool or model existed, or impossible token counts.
- Hourly and daily spikes in output tokens, total tokens or calls put an account under review. Accounts under review leave the boards and stats until they are cleared.

## Contracts

Rebuild after changing `packages/contracts/src`, then pack the tarball for the frontend and CLI:

```sh
cd packages/contracts && pnpm build && pnpm pack --pack-destination <frontend-or-cli>/vendor
```
