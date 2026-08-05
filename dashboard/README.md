# Vestra dashboard

## Local development

Run the API first, then the dashboard:

```bash
cd server && pnpm server
cd dashboard && pnpm dev
```

Copy `.env.example` to `.env`, set a Reown project ID, and retain the local
backend URL:

```dotenv
VESTRA_BACKEND_URL=http://127.0.0.1:3001
```

The browser always calls the dashboard at `/backend/*`. Next.js rewrites that
path **server-side** to `VESTRA_BACKEND_URL`, so browser calls do not need CORS
and the backend address is not exposed as a public client environment variable.

## Deployment as a monorepo

This repository contains two independently deployed applications:

- `server/` — Express admin API. Deploy as a Render Web Service with Root
  Directory `server` and Start Command `pnpm server`.
- `dashboard/` — Next.js web app. Deploy as a separate Web Service (or Vercel
  project) with Root Directory `dashboard`.

For a platform that supports the server-side rewrite, set this
**build-time/server-side** variable on the dashboard deployment:

```dotenv
VESTRA_BACKEND_URL=https://vestra-test.onrender.com
```

Do not name it `NEXT_PUBLIC_VESTRA_BACKEND_URL`: it is consumed by
`next.config.ts` to create a server-side rewrite. Trigger a dashboard redeploy
after changing it because Next.js resolves rewrites during the build.

The API itself keeps its admin signing keys exclusively in the `server` Render
service environment; they must never be set on the dashboard service.

### Vercel + Render

The Render API is publicly reachable at `https://vestra-test.onrender.com`, but
Vercel may reject an external rewrite when the upstream hostname resolves to an
IPv6/private address from Vercel's network. In that deployment pairing, call the
API directly instead of using the rewrite:

```dotenv
# Vercel dashboard environment
NEXT_PUBLIC_VESTRA_API_URL=https://vestra-test.onrender.com

# Render API environment
CORS_ORIGINS=https://vestra-test-three.vercel.app
```

`NEXT_PUBLIC_VESTRA_API_URL` is safe to expose: it is only the public API
origin. Never put Hedera admin keys or Pinata credentials in Vercel.

The user view connects an EVM wallet on Hedera Testnet and calls Hedera's HTS
system contract directly to associate a collection. The EVM identity must map
to an existing, funded Hedera ECDSA account.
