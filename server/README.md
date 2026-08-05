# Vestra testnet integration

This folder contains a real Hedera testnet integration harness for an already
deployed `VestraManager`. It creates a new test collection and real test NFT
receipts; use disposable testnet accounts only.

## Setup

```bash
cd typescript-integration
npm install
cp .env.example .env
```

Fill in the deployed numeric `VESTRA_CONTRACT_ID`, an authorised admin account,
and a separate investor account. The investor key is required because native HTS
association must be signed by the receiving account.

Set `TEST_RUN_ID` first, then publish HIP-412 JSON files and image assets to
the configured IPFS CID directory. The script uses
`receipt-<label>-<TEST_RUN_ID>.json` for `primary`, `corrected`, `replacement`,
`default`, and `revoked`. Their public financial fields must exactly match
`issueArgs` in `src/testnet-flow.ts`. Set `COLLECTION_CREATE_TINYBARS` to the
HBAR amount forwarded to HTS for collection creation.

## Execute

```bash
CONFIRM_TESTNET_WRITES=YES npm run testnet:flow
```

The safety latch prevents accidental writes. A full run validates admin access,
collection creation, investor association, atomic issuance/read-back, suspension
and resume, maturity/redemption, correction/replacement, default, revocation,
one-direct-replacement enforcement, and irreversible retirement.

## Convert an EVM key to Hedera SDK formats

```bash
EVM_PRIVATE_KEY=0x... npm run convert:key
```

This local-only converter prints the DER and raw Hedera ECDSA private/public
key forms and the shared EVM address. Never paste a production private key into
a shared terminal, chat, commit, or screenshot.
# Vestra TypeScript integration

## Local admin API

`pnpm server` starts an Express API on `http://0.0.0.0:3001`. It signs only
Vestra admin contract calls using `HEDERA_ADMIN_PRIVATE_KEY`; it never accepts,
stores, or uses an investor private key. The service deliberately refuses to
bind to a public interface because this initial version has no authentication.

Copy `.env.example` to `.env` and provide the admin and Pinata values, or use
the repository-level `.env` already used by the deployment scripts (the server
falls back to it when this folder has no `.env`). The existing testnet contract
is `0.0.9917595` unless you have deployed another one. `PINATA_JWT_SECRET` is
the Pinata JWT, not an API key or API secret.

The service writes a local, Git-ignored `data/registry.json`. It stores public
display and operational data only: token address, receipt IDs, terms shown in
the certificate, CIDs, status and transaction IDs. Raw instrument references,
terms documents and lifecycle evidence are hashed in memory and are never
persisted by this API.

Available endpoints:

- `GET /health`, `GET /assets`, `GET /assets/:assetClassId`, `GET /receipts/:receiptId`
- `POST /admin/assets` creates a collection and records it locally.
- `POST /admin/assets/import` registers an already-created collection locally.
- `POST /admin/assets/:assetClassId/suspend|resume|retire`
- `POST /admin/receipts` produces a PNG certificate, PDF and HIP-412 manifest,
  pins them to Pinata, then atomically issues the receipt NFT.
- `POST /admin/receipts/:receiptId/mature|redeem|default|revoke|correct`
- `GET /assets/:assetClassId/association` gives the dashboard the token address
  that a user must associate with through their own connected wallet.

Receipt amount fields use integer minor units (for NGN, kobo). Dates are Unix
seconds. `assetClassId` is the bytes32 ID returned by asset creation; a receipt
response exposes both its friendly UUID `publicId` and its contract `receiptId`.

Example collection request:

```sh
curl -X POST http://127.0.0.1:3001/admin/assets \
  -H 'content-type: application/json' \
  -d '{"assetClassKey":"NIGERIAN_TBILL","name":"Nigerian Treasury Bill","symbol":"VTB","description":"Custodial Nigerian Treasury Bill receipts.","imageUri":"ipfs://YOUR_COLLECTION_IMAGE_CID"}'
```

Example issuance request (the recipient must first associate the collection
through their own wallet):

```json
{
  "assetClassId": "0x...",
  "recipient": "0x...",
  "currency": "NGN",
  "purchaseAmountMinor": "200000000",
  "faceValueMinor": "200000000",
  "expectedInterestMinor": "33126319",
  "annualYieldBps": 1700,
  "effectiveDate": 1742342400,
  "maturityDate": 1773878400,
  "instrumentReference": "internal-only reference",
  "termsDocument": { "schema": "vestra.receipt/tbill/1" }
}
```

For a correction, call `correct` on the old receipt first, then issue one new
receipt with `replacesReceiptId` set to the old receipt's contract ID. The
contract enforces one direct replacement while retaining the old frozen NFT.
