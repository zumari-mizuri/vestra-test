# Vestra Manager

Vestra Manager issues native Hedera NFT receipts for custodied real-world asset
(RWA) products such as Nigerian Treasury Bills and Savings Bonds.

It is intentionally a narrow record-and-lifecycle contract. It does **not**
perform KYC, accept funds, purchase securities, custody assets, settle an
investment, or independently establish legal ownership of an instrument. Those
duties remain with Vestra's off-chain operations and custody/product agreements.

The NFT is a non-transferable on-chain record that a wallet is Vestra's recorded
holder of a custodial receipt. Its legal meaning comes from the applicable
agreements, not Solidity alone.

## Testnet deployment

- Network: Hedera Testnet (`296`)
- Contract: [`0xe7086a39b97A2A81327D55264E1119F61000781d`](https://hashscan.io/testnet/contract/0.0.9917595)
- Hedera contract ID: `0.0.9917595`
- Deployment: [`0x4950…94a03`](https://hashscan.io/testnet/transaction/0.0.6938813@1785883057.714735705)
- Verification: Sourcify exact runtime match

> The deployment and dashboard purchase flow are a **testnet demonstration**.
> A testnet receipt is not an investment, payment confirmation, or custody
> entitlement.

## Operating model

```text
Off-chain Vestra operations
KYC · payment · investment purchase · custody · evidence · settlement
                              │
                              │ public terms + cryptographic hashes
                              ▼
                    VestraManager contract
                       native HTS NFT receipts
                         │                   │
             mint + transfer + freeze         │ creates
                         ▼                   ▼
                 Investor's wallet    Collection per asset class
                                      e.g. Nigerian Treasury Bills
```

### The deliberate design choices

1. **One collection per asset class.** A Treasury Bill collection is not tied
   to a particular issue or maturity date. Each NFT receipt carries its own
   amount, dates and yield.
2. **Receipts are soulbound.** HTS default-freeze plus the contract's freeze key
   prevents normal transfers. There is no transfer, approval, burn, wipe, or
   migration method in this contract.
3. **Redeemed does not mean deleted.** On redemption, the receipt becomes
   `REDEEMED` and stays frozen in the original wallet as historical evidence.
4. **Terms are immutable; operational facts are attested.** The NFT metadata
   URI and core economic terms are set at issuance. Maturity/redemption status
   changes are separate, evidence-backed lifecycle events.
5. **Privacy is an explicit boundary.** The contract stores public product terms
   and hashes—not names, BVN/NIN, bank details, KYC, payment references, or
   scanned documents.

## Roles and why they are separated

| Role                         | Contract authority                                                     | Security purpose                                                       |
| ---------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Owner                        | Adds/removes admins; transfers ownership                               | Governance control. Preferrably cold multisig, not a daily hot wallet. |
| Admin                        | Creates/controls collections, issues receipts, attests lifecycle state | Operational signer after off-chain compliance and custody checks.      |
| Investor                     | Associates their own Hedera account; receives/views a receipt          | Owns the recipient wallet but cannot mint or change status.            |
| VestraManager                | HTS supply/freeze keys, HTS treasury and auto-renew account            | Forces mint, delivery and freezing through the programmed flow.        |
| Custody/compliance operation |                                                                        | Produces the documents and evidence that justify an admin action.      |

There is deliberately no `userMint`. An investor's wallet consents to receiving
an HTS token by associating it; an admin attests that the real off-chain
conditions for issuance have been met.

For production, owner and admin would be independently controlled multisigs.
This repo demostrates our mvp and thesis

## State machines

### Collections

```text
                 suspend                 resume
ACTIVE ─────────────────────▶ SUSPENDED ───────▶ ACTIVE
  │                              │
  └────────── retire ────────────┴─────────────▶ RETIRED (terminal)
```

| State       | New receipts | Meaning                                                                   |
| ----------- | ------------ | ------------------------------------------------------------------------- |
| `ACTIVE`    | Yes          | Asset class is currently supported.                                       |
| `SUSPENDED` | No           | Temporary operational/compliance hold. Existing receipts stay verifiable. |
| `RETIRED`   | Never        | Permanently no longer offered. Existing receipts stay verifiable.         |

Collections are not deleted because deleting an HTS token weakens historic
verification and makes prior records harder to inspect.

### Receipts

```text
NONE ── issue ──▶ ISSUED ── mature ──▶ MATURED ── redeem ──▶ REDEEMED
                     │                     │                     terminal
                     └────── redeem ───────┘

ISSUED or MATURED ──▶ DEFAULTED | REVOKED | CORRECTED
                                      all terminal

CORRECTED ── issue exactly one replacement to same wallet ──▶ new ISSUED
```

- `ISSUED`: receipt was attested, minted, transferred and frozen.
- `MATURED`: an admin attested actual maturity; this is not set merely because
  `block.timestamp` crossed a projected date.
- `REDEEMED`: settlement is confirmed; the NFT remains as history.
- `DEFAULTED` / `REVOKED`: exceptional outcomes whose off-chain legal and
  operational definitions must be documented before use.
- `CORRECTED`: a term or issuance error exists. The old NFT remains frozen.

Every lifecycle transition requires a nonzero hash of supporting off-chain
evidence. The evidence itself remains private.

### Correction invariant

One corrected receipt can have exactly one direct replacement, and the
replacement must be issued to the same wallet. This prevents multiple NFTs from
claiming to replace a single investment.

```text
A (CORRECTED) ──▶ B (CORRECTED) ──▶ C (ISSUED)
```

The contract rejects a second direct replacement for A; later corrections form
a linear chain rather than parallel “current” receipts.

## Procedural flow

### A. Admin creates a collection

1. The backend derives a stable `bytes32 assetClassId` for a product class.
2. Admin funds and calls `createCollection(assetClassId, name, symbol)`.
3. The manager creates a native HTS NFT collection with itself as treasury and
   auto-renew account, and grants itself supply and freeze keys.
4. The contract stores the collection as `ACTIVE` and emits
   `CollectionCreated`.

Token creation fees are network-dependent.

### B. Investor starts a testnet purchase

```text
User chooses collection, tenor, and NGN amount
        │
        ▼
Does the Hedera account already associate the NFT collection?
        │ no
        ▼
Connected EVM wallet signs HTS associateToken(account, token)
        │
        ▼
Dashboard verifies association via Mirror Node
        │
        ▼
Dashboard calls POST /admin/receipts (testnet demo only)
        │
        ▼
Backend creates/pins certificate PNG, PDF and HIP-412 JSON to IPFS
        │
        ▼
Backend admin calls issueReceipt(...)
```

The dashboard's direct call to the no-auth local admin API is solely to show an
end-to-end testnet flow. Real issuance must first follow payment, KYC, product
purchase, custody confirmation, document generation and compliance approval.

### C. Atomic receipt issuance

`issueReceipt` performs this sequence in one call:

```text
validate collection is ACTIVE and all immutable input is valid
        │
        ▼
validate optional correction pointer and one-replacement rule
        │
        ▼
HTS mints one NFT using the exact ipfs:// HIP-412 metadata URI
        │
        ▼
HTS unfreezes recipient → transfers NFT serial → freezes recipient
        │
        ▼
stores the receipt as ISSUED and emits ReceiptIssued / ReceiptStatusChanged
```

If any HTS operation fails, the call reverts. It cannot leave a “receipt stored
but NFT not delivered” partial state.

### D. Verify and display a receipt

1. Query `getReceipt(receiptId)` or `verifyReceipt(receiptId)`.
2. Read native NFT ownership/serial from Hedera or Mirror Node.
3. Retrieve the native NFT metadata URI and its immutable IPFS HIP-412 JSON.
4. Confirm the URI hash and public terms against the contract's receipt fields.
5. Read live status from the contract and events—not immutable metadata.

The dashboard's success dialog displays the generated certificate. Its image and
the visible Hedera transaction ID both open the issuance transaction in HashScan.

### E. Maturity, redemption, or exception

1. Vestra's operation creates and signs/canonically serializes supporting
   evidence off-chain.
2. It hashes that evidence.
3. Admin calls `markMatured`, `markRedeemed`, `markDefaulted`, `markRevoked`,
   or `markCorrected` with the receipt ID and evidence hash.
4. The contract records the new status/time and emits `ReceiptStatusChanged`.

The immutable metadata JSON is never edited to say “Redeemed.” Current state is
on-chain, which preserves the integrity of the original terms document.

## HIP-412 metadata and IPFS

The HTS NFT metadata bytes contain a short immutable `ipfs://.../receipt.json`
URI, following [HIP-412](https://hips.hedera.com/hip/hip-412). Hedera NFT
metadata has a 100-byte limit, so it must be a pointer rather than a full
document.

```json
{
  "name": "Vestra Nigerian Treasury Bill Receipt #15313",
  "description": "Non-transferable digital receipt for a custodially held Nigerian Treasury Bill.",
  "format": "HIP412@2.0.0",
  "type": "image/png",
  "image": "ipfs://bafy.../certificate.png",
  "attributes": [
    { "trait_type": "Asset Class", "value": "Nigerian Treasury Bill" },
    { "trait_type": "Currency", "value": "NGN" },
    { "trait_type": "Purchase Amount", "value": "NGN 2,000,000.00" },
    { "trait_type": "Annual Yield", "value": "17.00%" }
  ],
  "properties": {
    "schema": "vestra.receipt/tbill/1",
    "receipt_id": "opaque-public-id",
    "terms_hash": "0x...",
    "issuer": "Vestra"
  }
}
```

We Never publish customer names, account numbers, BVN/NIN, raw bank/broker
references, scanned documents, payment proof, or mutable status in public
metadata.

To convert a Pinata gateway URL with a folder path:

```text
https://copper-rapid-python-934.mypinata.cloud/ipfs/<CID>/cover-01.png
```

we use the portable IPFS URI:

```text
ipfs://<CID>/cover-01.png
```

## Contract surface

**Owner only:** `addAdmin`, `removeAdmin`, `transferOwnership`.

**Admin only:** `createCollection` (payable), `suspendCollection`,
`resumeCollection`, `retireCollection`, `issueReceipt`, and all `mark*`
lifecycle functions.

**Public reads:** `isAdmin`, `collectionExists`, `getCollection`,
`receiptExists`, `getReceipt`, `verifyReceipt`, and `getReplacementReceiptId`.

The contract has a payable `receive()` function because it is each collection's
HTS auto-renew account. It intentionally has no HBAR withdrawal method.
Operations must fund and monitor its HBAR balance.

## Repository and development

| Path                                     | Purpose                                                          |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `src/VestraManager.sol`                  | Contract, authorization, receipt and collection state machines.  |
| `src/interfaces/IHederaTokenService.sol` | Minimal HTS interface used by the contract.                      |
| `script/DeployVestraManager.s.sol`       | Foundry deployment script.                                       |
| `typescript-integration/`                | Local Express admin API, Pinata certificate/metadata generation. |
| `dashboard/`                             | Next.js testnet dashboard, wallet association and demo purchase. |

The constructor takes the HTS address so unit tests can use a mock. On Hedera,
we use the HTS precompile `0x0000000000000000000000000000000000000167` (`0x167`).

```bash
forge test -vvv

forge script script/DeployVestraManager.s.sol:DeployVestraManager \
  --rpc-url "$HEDERA_RPC" \
  --broadcast
```
