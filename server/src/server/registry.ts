import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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
type RegistryFile = { version: 1; assets: Asset[]; receipts: Receipt[] };
const empty = (): RegistryFile => ({ version: 1, assets: [], receipts: [] });

export class Registry {
  private data: RegistryFile | undefined;
  constructor(private readonly path: string) {}
  async all(): Promise<RegistryFile> {
    return structuredClone(await this.load());
  }
  async asset(id: string): Promise<Asset | undefined> {
    return (await this.load()).assets.find(
      (item) => item.assetClassId.toLowerCase() === id.toLowerCase(),
    );
  }
  async receipt(id: string): Promise<Receipt | undefined> {
    return (await this.load()).receipts.find(
      (item) =>
        item.receiptId.toLowerCase() === id.toLowerCase() ||
        item.publicId === id,
    );
  }
  async addAsset(asset: Asset): Promise<void> {
    const data = await this.load();
    if (data.assets.some((item) => item.assetClassId === asset.assetClassId))
      throw new Error("Asset class is already in the registry");
    data.assets.push(asset);
    await this.save();
  }
  async addReceipt(receipt: Receipt): Promise<void> {
    const data = await this.load();
    if (data.receipts.some((item) => item.receiptId === receipt.receiptId))
      throw new Error("Receipt is already in the registry");
    data.receipts.push(receipt);
    if (receipt.replacesReceiptId !== "0x".padEnd(66, "0")) {
      const prior = data.receipts.find(
        (item) => item.receiptId === receipt.replacesReceiptId,
      );
      if (prior) prior.replacementReceiptId = receipt.receiptId;
    }
    await this.save();
  }
  async updateAsset(id: string, patch: Partial<Asset>): Promise<Asset> {
    const item = await this.asset(id);
    if (!item) throw new Error("Asset class is not in the registry");
    Object.assign(item, patch);
    await this.save();
    return structuredClone(item);
  }
  async updateReceipt(id: string, patch: Partial<Receipt>): Promise<Receipt> {
    const item = await this.receipt(id);
    if (!item) throw new Error("Receipt is not in the registry");
    Object.assign(item, patch);
    await this.save();
    return structuredClone(item);
  }
  private async load(): Promise<RegistryFile> {
    if (this.data) return this.data;
    try {
      this.data = JSON.parse(await readFile(this.path, "utf8")) as RegistryFile;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.data = empty();
    }
    return this.data;
  }
  private async save(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.tmp`;
    await writeFile(temp, JSON.stringify(this.data, null, 2) + "\n", "utf8");
    await rename(temp, this.path);
  }
}
