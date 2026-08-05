import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { AccountId, TokenId } from "@hashgraph/sdk";
import dotenv from "dotenv";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";
import {
  ZERO_BYTES32,
  assetClassId,
  currencyBytes3,
  receiptId,
  secretHash,
} from "./ids.ts";
import { HederaManager } from "./hedera.ts";
import {
  certificatePdf,
  certificatePng,
  hip412,
  type PublicTerms,
} from "./media.ts";
import { Pinata } from "./pinata.ts";
import { Registry, type Asset, type Receipt } from "./registry.ts";

// Prefer an integration-specific file, but let the existing repository .env work too.
dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH ?? join(process.cwd(), ".env"),
});
dotenv.config({ path: join(process.cwd(), "..", ".env"), override: false });

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
};

// Render supplies PORT at runtime and needs the service to accept traffic on
// every interface. `||` intentionally treats an accidentally empty env value
// as absent: Number("") is 0, which makes Node select a random port.
const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || "0.0.0.0";

const collectionFee = Number(required("COLLECTION_CREATE_TINYBARS"));
if (!Number.isSafeInteger(collectionFee) || collectionFee <= 0)
  throw new Error("COLLECTION_CREATE_TINYBARS must be a positive integer");
const manager = new HederaManager(
  required("VESTRA_CONTRACT_ID"),
  required("HEDERA_ADMIN_ID"),
  required("HEDERA_ADMIN_PRIVATE_KEY"),
);
const pinata = new Pinata(required("PINATA_JWT_SECRET"));
const registry = new Registry(join(process.cwd(), "data", "registry.json"));
const app = express();
app.use(express.json({ limit: "256kb" }));

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "must be bytes32 hex");
const minor = z
  .union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])
  .transform((value) => BigInt(value));
const seconds = z.number().int().positive();
const assetInput = z.object({
  assetClassKey: z.string().regex(/^[A-Z][A-Z0-9_]{1,47}$/),
  name: z.string().min(2).max(100),
  symbol: z.string().regex(/^[A-Z0-9]{1,10}$/),
  description: z.string().min(10).max(500),
  imageUri: z.string().regex(/^ipfs:\/\//),
});
const receiptInput = z
  .object({
    assetClassId: hex32,
    recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
    purchaseAmountMinor: minor,
    faceValueMinor: minor,
    expectedInterestMinor: minor,
    annualYieldBps: z.number().int().min(0).max(100_000),
    effectiveDate: seconds,
    maturityDate: seconds,
    instrumentReference: z.string().min(1).max(500),
    termsDocument: z.unknown(),
    replacesReceiptId: hex32.optional(),
    publicId: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.maturityDate <= value.effectiveDate)
      ctx.addIssue({
        code: "custom",
        message: "maturityDate must be after effectiveDate",
        path: ["maturityDate"],
      });
  });
const evidenceInput = z.object({ evidence: z.unknown() });
const importInput = assetInput.extend({
  assetClassId: hex32,
  tokenAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  status: z.enum(["ACTIVE", "SUSPENDED", "RETIRED"]).default("ACTIVE"),
});
const statuses: Record<string, number> = {
  ISSUED: 1,
  MATURED: 2,
  REDEEMED: 3,
  DEFAULTED: 4,
  REVOKED: 5,
  CORRECTED: 6,
};
const collectionStatuses: Record<string, string> = {
  suspend: "SUSPENDED",
  resume: "ACTIVE",
  retire: "RETIRED",
};

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  return schema.parse(body);
}
function asString(value: unknown): string {
  return String(value);
}
function receiptResponse(record: any) {
  return {
    receiptId: asString(record.receiptId),
    assetClassId: asString(record.assetClassId),
    owner: asString(record.owner),
    tokenAddress: asString(record.tokenAddress),
    serialNumber: asString(record.serialNumber),
    status: Number(record.status),
    issuedAt: asString(record.issuedAt),
    statusChangedAt: asString(record.statusChangedAt),
    replacesReceiptId: asString(record.replacesReceiptId),
  };
}
async function requireAsset(id: string) {
  const asset = await registry.asset(id);
  if (!asset)
    throw Object.assign(
      new Error(
        "Unknown asset class; import it first or create it through this API",
      ),
      { status: 404 },
    );
  return asset;
}
async function requireReceipt(id: string) {
  const record = await registry.receipt(id);
  if (!record)
    throw Object.assign(new Error("Unknown receipt"), { status: 404 });
  return record;
}

app.get("/health", async (_req, res) => {
  const adminAddress = AccountId.fromString(
    required("HEDERA_ADMIN_ID"),
  ).toSolidityAddress();
  const [admin] = await manager.read("isAdmin", [adminAddress]);
  res.json({
    ok: true,
    network: "testnet",
    admin: Boolean(admin),
    contractId: required("VESTRA_CONTRACT_ID"),
  });
});
app.get("/assets", async (_req, res) =>
  res.json((await registry.all()).assets),
);
app.get("/receipts", async (req, res) => {
  const assetClassId =
    typeof req.query.assetClassId === "string"
      ? req.query.assetClassId.toLowerCase()
      : undefined;
  const receipts = (await registry.all()).receipts.filter(
    (receipt) =>
      !assetClassId || receipt.assetClassId.toLowerCase() === assetClassId,
  );
  res.json(receipts);
});
app.get("/assets/:assetClassId", async (req, res) => {
  const asset = await requireAsset(req.params.assetClassId);
  res.json(asset);
});
app.get("/assets/:assetClassId/association", async (req, res) => {
  const asset = await requireAsset(req.params.assetClassId);
  res.json({
    network: "testnet",
    tokenAddress: asset.tokenAddress,
    tokenId: TokenId.fromSolidityAddress(asset.tokenAddress).toString(),
    message:
      "The wallet holder must sign a Hedera TokenService association for this token before an admin can issue a receipt to it.",
  });
});
app.get("/receipts/:receiptId", async (req, res) => {
  const local = await requireReceipt(req.params.receiptId);
  const [chain] = await manager.read("getReceipt", [local.receiptId]);
  res.json({ local, chain: receiptResponse(chain) });
});

app.post("/admin/assets", async (req, res) => {
  const input = parse(assetInput, req.body);
  const id = assetClassId(input.assetClassKey);
  if (await registry.asset(id))
    throw Object.assign(new Error("Asset class already exists locally"), {
      status: 409,
    });
  const tx = await manager.write(
    "createCollection",
    [id, input.name, input.symbol],
    collectionFee,
  );
  const [chain] = await manager.read("getCollection", [id]);
  const asset: Asset = {
    ...input,
    assetClassId: id,
    tokenAddress: String(chain.tokenAddress),
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    transactionId: tx,
  };
  await registry.addAsset(asset);
  res.status(201).json(asset);
});
app.post("/admin/assets/import", async (req, res) => {
  const input = parse(importInput, req.body);
  const asset: Asset = { ...input, createdAt: new Date().toISOString() };
  await registry.addAsset(asset);
  res.status(201).json(asset);
});
for (const action of Object.keys(collectionStatuses))
  app.post(`/admin/assets/:assetClassId/${action}`, async (req, res) => {
    const asset = await requireAsset(req.params.assetClassId);
    const tx = await manager.write(`${action}Collection`, [asset.assetClassId]);
    const updated = await registry.updateAsset(asset.assetClassId, {
      status: collectionStatuses[action],
      transactionId: tx,
    });
    res.json(updated);
  });

app.post("/admin/receipts", async (req, res) => {
  const input = parse(receiptInput, req.body);
  const asset = await requireAsset(input.assetClassId);
  if (asset.status !== "ACTIVE")
    throw Object.assign(
      new Error("Only ACTIVE collections can issue receipts"),
      { status: 409 },
    );
  const publicId = input.publicId ?? randomUUID();
  const id = receiptId(publicId);
  if (await registry.receipt(id))
    throw Object.assign(new Error("Receipt already exists"), { status: 409 });
  const termsHash = secretHash("terms", input.termsDocument);
  const terms: PublicTerms = {
    name: `Vestra ${asset.name} Receipt #${publicId}`,
    description: `Non-transferable digital receipt for a custodially held ${asset.name}.`,
    assetClassName: asset.name,
    currency: input.currency,
    purchaseAmountMinor: input.purchaseAmountMinor,
    faceValueMinor: input.faceValueMinor,
    expectedInterestMinor: input.expectedInterestMinor,
    annualYieldBps: input.annualYieldBps,
    effectiveDate: input.effectiveDate,
    maturityDate: input.maturityDate,
    publicId,
    termsHash,
  };
  const imageUri = await pinata.upload(
    `vestra-${publicId}.png`,
    await certificatePng(terms),
    "image/png",
  );
  const pdfUri = await pinata.upload(
    `vestra-${publicId}.pdf`,
    await certificatePdf(terms),
    "application/pdf",
  );
  const metadata = hip412(terms, imageUri, pdfUri);
  const metadataUri = await pinata.upload(
    `vestra-${publicId}.json`,
    JSON.stringify(metadata),
    "application/json",
  );
  if (Buffer.byteLength(metadataUri) > 100)
    throw new Error(
      "IPFS metadata URI exceeds Hedera's 100-byte NFT metadata limit",
    );
  const replaces = input.replacesReceiptId ?? ZERO_BYTES32;
  const tx = await manager.write("issueReceipt", [
    asset.assetClassId,
    id,
    secretHash("instrument", input.instrumentReference),
    input.recipient,
    currencyBytes3(input.currency),
    input.purchaseAmountMinor,
    input.faceValueMinor,
    input.expectedInterestMinor,
    input.annualYieldBps,
    BigInt(input.effectiveDate),
    BigInt(input.maturityDate),
    termsHash,
    replaces,
    metadataUri,
  ]);
  const [chain] = await manager.read("getReceipt", [id]);
  const result: Receipt = {
    publicId,
    receiptId: id,
    assetClassId: asset.assetClassId,
    assetClassKey: asset.assetClassKey,
    owner: input.recipient,
    tokenAddress: String(chain.tokenAddress),
    serialNumber: String(chain.serialNumber),
    currency: input.currency,
    purchaseAmountMinor: input.purchaseAmountMinor.toString(),
    faceValueMinor: input.faceValueMinor.toString(),
    expectedInterestMinor: input.expectedInterestMinor.toString(),
    annualYieldBps: input.annualYieldBps,
    effectiveDate: input.effectiveDate,
    maturityDate: input.maturityDate,
    metadataUri,
    imageUri,
    pdfUri,
    status: "ISSUED",
    replacesReceiptId: replaces,
    issuedAt: new Date().toISOString(),
    transactionId: tx,
  };
  await registry.addReceipt(result);
  res.status(201).json(result);
});

const lifecycle: Record<
  string,
  { method: string; status: string; allowed: number[] }
> = {
  mature: { method: "markMatured", status: "MATURED", allowed: [1] },
  redeem: { method: "markRedeemed", status: "REDEEMED", allowed: [1, 2] },
  default: { method: "markDefaulted", status: "DEFAULTED", allowed: [1, 2] },
  revoke: { method: "markRevoked", status: "REVOKED", allowed: [1, 2] },
  correct: { method: "markCorrected", status: "CORRECTED", allowed: [1, 2] },
};
for (const [action, rule] of Object.entries(lifecycle))
  app.post(`/admin/receipts/:receiptId/${action}`, async (req, res) => {
    const local = await requireReceipt(req.params.receiptId);
    const [chain] = await manager.read("getReceipt", [local.receiptId]);
    if (!rule.allowed.includes(Number(chain.status)))
      throw Object.assign(
        new Error(`${action} is not valid from the current on-chain status`),
        { status: 409 },
      );
    const evidenceHash = secretHash(
      "evidence",
      parse(evidenceInput, req.body).evidence,
    );
    const tx = await manager.write(rule.method, [
      local.receiptId,
      evidenceHash,
    ]);
    const updated = await registry.updateReceipt(local.receiptId, {
      status: rule.status,
      statusEvidenceHash: evidenceHash,
      transactionId: tx,
    });
    res.json(updated);
  });

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Vestra API error]", error);
  const zod = error instanceof z.ZodError;
  const requestedStatus =
    typeof error === "object" && error && "status" in error
      ? Number((error as { status: number }).status)
      : undefined;
  // Hedera SDK statuses (for example, 33 = CONTRACT_REVERT_EXECUTED) are not
  // HTTP statuses. Only explicitly assigned application 4xx/5xx codes pass through.
  const status = zod
    ? 400
    : requestedStatus && requestedStatus >= 400 && requestedStatus <= 599
      ? requestedStatus
      : 500;
  const message = zod
    ? "Invalid request"
    : error instanceof Error
      ? error.message
      : "Internal server error";
  res
    .status(status)
    .json({ error: message, details: zod ? error.issues : undefined });
});
app.listen(port, host, () =>
  console.log(`Vestra admin API listening on http://${host}:${port}`),
);
