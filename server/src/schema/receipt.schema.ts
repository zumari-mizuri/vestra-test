import { z } from "zod";

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "must be bytes32 hex");
const minor = z
  .union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])
  .transform((value) => BigInt(value));
const seconds = z.number().int().positive();

export const receiptInput = z
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

export const evidenceInput = z.object({ evidence: z.unknown() });
export type ReceiptInput = z.infer<typeof receiptInput>;
