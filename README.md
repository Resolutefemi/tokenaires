# Tokenaires frontend

The public rich list: the board, the top three, developer profiles and their share cards.

Next.js 16 (App Router, Cache Components), React 19, Tailwind CSS 4, TanStack Query, Radix primitives, Solar icons and the Aspekta typeface.

## Setup

```sh
pnpm install
cp .env.example .env.local
pnpm dev
```

The site runs on http://localhost:7021 and reads from the API in `NEXT_PUBLIC_API_URL` (default http://localhost:7020/api/v1). Start the backend first; see the `backend` branch.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server on port 7021 |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build on port 7021 |
| `pnpm typecheck` | Generate route types and run TypeScript |
| `pnpm lint` | ESLint |

## Layout

- `app/` routes: `/` board, `/u/[handle]` profile with its Open Graph card, `/u/[handle]/badge.svg` live README badge, `/how-it-works`
- `components/board`, `components/profile`, `components/home` feature components
- `components/ui` shared primitives (Button, SegmentedTabs, Select, Avatar, Skeleton, Tooltip)
- `lib/api` API client, `lib/data` cached server reads, `hooks` TanStack Query hooks
- `vendor/tokenaires-contracts-*.tgz` shared API contracts packed from `backend/packages/contracts`

## README badge

`/u/<handle>/badge.svg` renders an SVG badge from the same cached profile read as the profile page. It is not a static file: the tier and token total are read from the API on each request, and the response carries a five minute cache so GitHub's image proxy and other CDNs pick up new totals without hammering the API. Unknown handles and API failures return a readable fallback badge instead of a broken image.

```md
[![Tokenaires badge](https://tokenaires.cc/u/appdever01/badge.svg)](https://tokenaires.cc/u/appdever01)
```

Profiles copy that snippet with the **README badge** button.

## Contracts

Response shapes come from `@tokenaires/contracts`, owned by the backend. After a contract change, pack it from the backend and reinstall:

```sh
cd ../backend/packages/contracts && pnpm build && pnpm pack --pack-destination ../../../frontend/vendor
cd ../../../frontend && pnpm add ./vendor/tokenaires-contracts-<version>.tgz
```

## Brand

The logo mark lives in `public/brand/` (SVG and 512px PNG) and `assets/brand/` (PNG read by the Open Graph and icon routes). Brand lime is `#BEF264`. On light backgrounds the mark sits on a dark tile.

## Fonts

Aspekta is used under the SIL Open Font License. See `app/fonts/OFL-Aspekta.txt`.
