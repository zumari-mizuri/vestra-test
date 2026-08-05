import mongoose from "mongoose";
import { AssetModel } from "../schema/asset.model.ts";
import { ReceiptModel } from "../schema/receipt.model.ts";

export type Asset = {
  assetClassKey: string;
  assetClassId: string;
  name: string;
  symbol: string;
  description: string;
  imageUri: string;
  tokenAddress: string;
  status: string;
  createdAt: string;
  transactionId?: string;
};

export type Receipt = {
  publicId: string;
  receiptId: string;
  assetClassId: string;
  assetClassKey: string;
  owner: string;
  tokenAddress: string;
  serialNumber: string;
  currency: string;
  purchaseAmountMinor: string;
  faceValueMinor: string;
  expectedInterestMinor: string;
  annualYieldBps: number;
  effectiveDate: number;
  maturityDate: number;
  metadataUri: string;
  imageUri: string;
  pdfUri: string;
  status: string;
  replacesReceiptId: string;
  replacementReceiptId?: string;
  issuedAt: string;
  transactionId?: string;
  statusEvidenceHash?: string;
};

const ZERO_BYTES32 = "0x".padEnd(66, "0");

function plain<T>(value: unknown): T {
  const record = value as Record<string, unknown>;
  delete record._id;
  return record as T;
}

/** MongoDB-backed record cache for the contract's public collections/receipts. */
export class Registry {
  private connection: Promise<typeof mongoose> | undefined;

  constructor(private readonly mongoUri: string) {}

  /** Establish the database connection before the HTTP server accepts traffic. */
  async connect(): Promise<{ host: string; database: string }> {
    await this.ready();
    return {
      host: mongoose.connection.host,
      database: mongoose.connection.name,
    };
  }

  async all(): Promise<{ version: 1; assets: Asset[]; receipts: Receipt[] }> {
    await this.ready();
    const [assets, receipts] = await Promise.all([
      AssetModel.find().sort({ createdAt: -1 }).lean(),
      ReceiptModel.find().sort({ issuedAt: -1 }).lean(),
    ]);
    return {
      version: 1,
      assets: assets.map((asset) => plain<Asset>(asset)),
      receipts: receipts.map((receipt) => plain<Receipt>(receipt)),
    };
  }

  async asset(id: string): Promise<Asset | undefined> {
    await this.ready();
    const asset = await AssetModel.findOne({ assetClassId: new RegExp(`^${id}$`, "i") }).lean();
    return asset ? plain<Asset>(asset) : undefined;
  }

  async receipt(id: string): Promise<Receipt | undefined> {
    await this.ready();
    const receipt = await ReceiptModel.findOne({
      $or: [{ receiptId: new RegExp(`^${id}$`, "i") }, { publicId: id }],
    }).lean();
    return receipt ? plain<Receipt>(receipt) : undefined;
  }

  async addAsset(asset: Asset): Promise<void> {
    await this.ready();
    try {
      await AssetModel.create(asset);
    } catch (error) {
      if (isDuplicate(error)) throw new Error("Asset class is already in the registry");
      throw error;
    }
  }

  async addReceipt(receipt: Receipt): Promise<void> {
    await this.ready();
    try {
      await ReceiptModel.create(receipt);
    } catch (error) {
      if (isDuplicate(error)) throw new Error("Receipt already exists in the registry");
      throw error;
    }
    if (receipt.replacesReceiptId !== ZERO_BYTES32) {
      await ReceiptModel.updateOne(
        { receiptId: receipt.replacesReceiptId },
        { $set: { replacementReceiptId: receipt.receiptId } },
      );
    }
  }

  async updateAsset(id: string, patch: Partial<Asset>): Promise<Asset> {
    await this.ready();
    const asset = await AssetModel.findOneAndUpdate(
      { assetClassId: new RegExp(`^${id}$`, "i") },
      { $set: patch },
      { new: true },
    ).lean();
    if (!asset) throw new Error("Asset class is not in the registry");
    return plain<Asset>(asset);
  }

  async updateReceipt(id: string, patch: Partial<Receipt>): Promise<Receipt> {
    await this.ready();
    const receipt = await ReceiptModel.findOneAndUpdate(
      { $or: [{ receiptId: new RegExp(`^${id}$`, "i") }, { publicId: id }] },
      { $set: patch },
      { new: true },
    ).lean();
    if (!receipt) throw new Error("Receipt is not in the registry");
    return plain<Receipt>(receipt);
  }

  private async ready(): Promise<void> {
    this.connection ??= mongoose.connect(this.mongoUri, {
      serverSelectionTimeoutMS: 10_000,
    });
    await this.connection;
  }
}

function isDuplicate(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === 11000;
}
