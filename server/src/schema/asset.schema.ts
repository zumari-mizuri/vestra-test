import { z } from "zod";

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "must be bytes32 hex");

export const assetInput = z.object({
  assetClassKey: z.string().trim().min(1),
  name: z.string().trim().min(1),
  symbol: z.string().trim().min(1),
  description: z.string().trim().min(1),
  imageUri: z.string().trim().min(1),
});

export const importAssetInput = assetInput.extend({
  assetClassId: hex32,
  tokenAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  status: z.enum(["ACTIVE", "SUSPENDED", "RETIRED"]).default("ACTIVE"),
});

export type AssetInput = z.infer<typeof assetInput>;
export type ImportAssetInput = z.infer<typeof importAssetInput>;
