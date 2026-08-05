import mongoose, { Schema } from "mongoose";
import type { Asset } from "../server/registry.ts";

const assetSchema = new Schema<Asset>(
  {
    assetClassKey: { type: String, required: true, unique: true },
    assetClassId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    symbol: { type: String, required: true },
    description: { type: String, required: true },
    imageUri: { type: String, required: true },
    tokenAddress: { type: String, required: true },
    status: { type: String, required: true, index: true },
    createdAt: { type: String, required: true },
    transactionId: String,
  },
  { versionKey: false },
);

export const AssetModel = mongoose.models.VestraAsset ?? mongoose.model<Asset>("VestraAsset", assetSchema);
