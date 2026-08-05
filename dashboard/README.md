# Vestra dashboard

Run the API first, then the dashboard:

```bash
cd typescript-integration && pnpm server
cd dashboard && pnpm dev
```

Copy `.env.example` to `.env` and set a Reown project ID. The dashboard proxies
browser calls to the local Express API through `/backend`, so admin secrets and
the backend address are never placed in client code.

The user view connects an EVM wallet on Hedera Testnet and calls Hedera's HTS
system contract directly to associate a collection. The EVM identity must map
to an existing, funded Hedera ECDSA account.
