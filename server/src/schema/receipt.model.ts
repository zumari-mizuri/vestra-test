import mongoose, { Schema } from "mongoose";
import type { Receipt } from "../server/registry.ts";

const receiptSchema = new Schema<Receipt>(
  {
    publicId: { type: String, required: true, unique: true },
    receiptId: { type: String, required: true, unique: true, index: true },
    assetClassId: { type: String, required: true, index: true },
    assetClassKey: { type: String, required: true },
    owner: { type: String, required: true, index: true },
    tokenAddress: { type: String, required: true },
    serialNumber: { type: String, required: true },
    currency: { type: String, required: true },
    purchaseAmountMinor: { type: String, required: true },
    faceValueMinor: { type: String, required: true },
    expectedInterestMinor: { type: String, required: true },
    annualYieldBps: { type: Number, required: true },
    effectiveDate: { type: Number, required: true },
    maturityDate: { type: Number, required: true },
    metadataUri: { type: String, required: true },
    imageUri: { type: String, required: true },
    pdfUri: { type: String, required: true },
    status: { type: String, required: true, index: true },
    replacesReceiptId: { type: String, required: true, index: true },
    replacementReceiptId: String,
    issuedAt: { type: String, required: true },
    transactionId: String,
    statusEvidenceHash: String,
  },
  { versionKey: false },
);

export const ReceiptModel = mongoose.models.VestraReceipt ?? mongoose.model<Receipt>("VestraReceipt", receiptSchema);
