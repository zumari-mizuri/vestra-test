import { z } from "zod";

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "must be bytes32 hex");

export const assetInput = z.object({
  assetClassKey: z.string().regex(/^[A-Z][A-Z0-9_]{1,47}$/),
  name: z.string().min(2).max(100),
  symbol: z.string().regex(/^[A-Z0-9]{1,10}$/),
  description: z.string().min(10).max(500),
  imageUri: z.string().regex(/^ipfs:\/\//),
});

export const importAssetInput = assetInput.extend({
  assetClassId: hex32,
  tokenAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  status: z.enum(["ACTIVE", "SUSPENDED", "RETIRED"]).default("ACTIVE"),
});

export type AssetInput = z.infer<typeof assetInput>;
export type ImportAssetInput = z.infer<typeof importAssetInput>;
