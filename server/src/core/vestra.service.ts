import { randomUUID } from "node:crypto";
import { AccountId, TokenId } from "@hashgraph/sdk";
import { ZERO_BYTES32, assetClassId, currencyBytes3, receiptId, secretHash } from "../server/ids.ts";
import { HederaManager } from "../server/hedera.ts";
import { certificatePdf, certificatePng, hip412, type PublicTerms } from "../server/media.ts";
import { Pinata } from "../server/pinata.ts";
import { Registry, type Asset, type Receipt } from "../server/registry.ts";
import type { AssetInput, ImportAssetInput } from "../schema/asset.schema.ts";
import type { ReceiptInput } from "../schema/receipt.schema.ts";
import { httpError } from "./http-error.ts";

const collectionStatuses: Record<string, string> = {
  suspend: "SUSPENDED",
  resume: "ACTIVE",
  retire: "RETIRED",
};
const lifecycle: Record<string, { method: string; status: string; allowed: number[] }> = {
  mature: { method: "markMatured", status: "MATURED", allowed: [1] },
  redeem: { method: "markRedeemed", status: "REDEEMED", allowed: [1, 2] },
  default: { method: "markDefaulted", status: "DEFAULTED", allowed: [1, 2] },
  revoke: { method: "markRevoked", status: "REVOKED", allowed: [1, 2] },
  correct: { method: "markCorrected", status: "CORRECTED", allowed: [1, 2] },
};

export class VestraService {
  constructor(
    private readonly manager: HederaManager,
    private readonly registry: Registry,
    private readonly pinata: Pinata,
    private readonly config: { adminId: string; contractId: string; collectionFee: number },
  ) {}

  async health() {
    const address = AccountId.fromString(this.config.adminId).toSolidityAddress();
    const [admin] = await this.manager.read("isAdmin", [address]);
    return { ok: true, network: "testnet", admin: Boolean(admin), contractId: this.config.contractId };
  }

  async assets() { return (await this.registry.all()).assets; }
  async receipts(assetClassId?: string) {
    const receipts = (await this.registry.all()).receipts;
    return assetClassId ? receipts.filter((item) => item.assetClassId.toLowerCase() === assetClassId.toLowerCase()) : receipts;
  }
  async asset(id: string) { return this.requireAsset(id); }
  async association(id: string) {
    const asset = await this.requireAsset(id);
    return {
      network: "testnet" as const,
      tokenAddress: asset.tokenAddress,
      tokenId: TokenId.fromSolidityAddress(asset.tokenAddress).toString(),
      message: "The wallet holder must sign a Hedera TokenService association for this token before an admin can issue a receipt to it.",
    };
  }
  async receipt(id: string) {
    const local = await this.requireReceipt(id);
    const [chain] = await this.manager.read("getReceipt", [local.receiptId]);
    return { local, chain: receiptResponse(chain) };
  }

  async createAsset(input: AssetInput): Promise<Asset> {
    const id = assetClassId(input.assetClassKey);
    if (await this.registry.asset(id)) throw httpError(409, "Asset class already exists");
    const transactionId = await this.manager.write("createCollection", [id, input.name, input.symbol], this.config.collectionFee);
    const [chain] = await this.manager.read("getCollection", [id]);
    const asset: Asset = { ...input, assetClassId: id, tokenAddress: String(chain.tokenAddress), status: "ACTIVE", createdAt: new Date().toISOString(), transactionId };
    await this.registry.addAsset(asset);
    return asset;
  }

  async importAsset(input: ImportAssetInput): Promise<Asset> {
    const asset: Asset = { ...input, createdAt: new Date().toISOString() };
    await this.registry.addAsset(asset);
    return asset;
  }

  async changeAsset(id: string, action: string): Promise<Asset> {
    const status = collectionStatuses[action];
    if (!status) throw httpError(404, "Unknown collection action");
    const asset = await this.requireAsset(id);
    const transactionId = await this.manager.write(`${action}Collection`, [asset.assetClassId]);
    return this.registry.updateAsset(asset.assetClassId, { status, transactionId });
  }

  async issueReceipt(input: ReceiptInput): Promise<Receipt> {
    const asset = await this.requireAsset(input.assetClassId);
    if (asset.status !== "ACTIVE") throw httpError(409, "Only ACTIVE collections can issue receipts");
    const publicId = input.publicId ?? randomUUID();
    const id = receiptId(publicId);
    if (await this.registry.receipt(id)) throw httpError(409, "Receipt already exists");
    const termsHash = secretHash("terms", input.termsDocument);
    const terms: PublicTerms = {
      name: `Vestra ${asset.name} Receipt #${publicId}`,
      description: `Non-transferable digital receipt for a custodially held ${asset.name}.`,
      assetClassName: asset.name, currency: input.currency,
      purchaseAmountMinor: input.purchaseAmountMinor, faceValueMinor: input.faceValueMinor,
      expectedInterestMinor: input.expectedInterestMinor, annualYieldBps: input.annualYieldBps,
      effectiveDate: input.effectiveDate, maturityDate: input.maturityDate, publicId, termsHash,
    };
    const imageUri = await this.pinata.upload(`vestra-${publicId}.png`, await certificatePng(terms), "image/png");
    const pdfUri = await this.pinata.upload(`vestra-${publicId}.pdf`, await certificatePdf(terms), "application/pdf");
    const metadataUri = await this.pinata.upload(`vestra-${publicId}.json`, JSON.stringify(hip412(terms, imageUri, pdfUri)), "application/json");
    if (Buffer.byteLength(metadataUri) > 100) throw new Error("IPFS metadata URI exceeds Hedera's 100-byte NFT metadata limit");
    const replacesReceiptId = input.replacesReceiptId ?? ZERO_BYTES32;
    const transactionId = await this.manager.write("issueReceipt", [
      asset.assetClassId, id, secretHash("instrument", input.instrumentReference), input.recipient,
      currencyBytes3(input.currency), input.purchaseAmountMinor, input.faceValueMinor,
      input.expectedInterestMinor, input.annualYieldBps, BigInt(input.effectiveDate),
      BigInt(input.maturityDate), termsHash, replacesReceiptId, metadataUri,
    ]);
    const [chain] = await this.manager.read("getReceipt", [id]);
    const receipt: Receipt = {
      publicId, receiptId: id, assetClassId: asset.assetClassId, assetClassKey: asset.assetClassKey,
      owner: input.recipient, tokenAddress: String(chain.tokenAddress), serialNumber: String(chain.serialNumber),
      currency: input.currency, purchaseAmountMinor: input.purchaseAmountMinor.toString(),
      faceValueMinor: input.faceValueMinor.toString(), expectedInterestMinor: input.expectedInterestMinor.toString(),
      annualYieldBps: input.annualYieldBps, effectiveDate: input.effectiveDate, maturityDate: input.maturityDate,
      metadataUri, imageUri, pdfUri, status: "ISSUED", replacesReceiptId,
      issuedAt: new Date().toISOString(), transactionId,
    };
    await this.registry.addReceipt(receipt);
    return receipt;
  }

  async changeReceipt(id: string, action: string, evidence: unknown): Promise<Receipt> {
    const rule = lifecycle[action];
    if (!rule) throw httpError(404, "Unknown receipt action");
    const receipt = await this.requireReceipt(id);
    const [chain] = await this.manager.read("getReceipt", [receipt.receiptId]);
    if (!rule.allowed.includes(Number(chain.status))) throw httpError(409, `${action} is not valid from the current on-chain status`);
    const statusEvidenceHash = secretHash("evidence", evidence);
    const transactionId = await this.manager.write(rule.method, [receipt.receiptId, statusEvidenceHash]);
    return this.registry.updateReceipt(receipt.receiptId, { status: rule.status, statusEvidenceHash, transactionId });
  }

  private async requireAsset(id: string): Promise<Asset> {
    const asset = await this.registry.asset(id);
    if (!asset) throw httpError(404, "Unknown asset class; import it first or create it through this API");
    return asset;
  }
  private async requireReceipt(id: string): Promise<Receipt> {
    const receipt = await this.registry.receipt(id);
    if (!receipt) throw httpError(404, "Unknown receipt");
    return receipt;
  }
}

function receiptResponse(record: Record<string, unknown>) {
  return {
    receiptId: String(record.receiptId), assetClassId: String(record.assetClassId), owner: String(record.owner),
    tokenAddress: String(record.tokenAddress), serialNumber: String(record.serialNumber), status: Number(record.status),
    issuedAt: String(record.issuedAt), statusChangedAt: String(record.statusChangedAt),
    replacesReceiptId: String(record.replacesReceiptId),
  };
}
