import type { Request, Response } from "express";
import type { VestraService } from "../core/vestra.service.ts";
import { assetInput, importAssetInput } from "../schema/asset.schema.ts";
import { evidenceInput, receiptInput } from "../schema/receipt.schema.ts";

const param = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value ?? "";

export function adminController(service: VestraService) {
  return {
    createAsset: async (req: Request, res: Response) => res.status(201).json(await service.createAsset(assetInput.parse(req.body))),
    importAsset: async (req: Request, res: Response) => res.status(201).json(await service.importAsset(importAssetInput.parse(req.body))),
    changeAsset: (action: string) => async (req: Request, res: Response) =>
      res.json(await service.changeAsset(param(req.params.assetClassId), action)),
    issueReceipt: async (req: Request, res: Response) => res.status(201).json(await service.issueReceipt(receiptInput.parse(req.body))),
    changeReceipt: (action: string) => async (req: Request, res: Response) => {
      const { evidence } = evidenceInput.parse(req.body);
      res.json(await service.changeReceipt(param(req.params.receiptId), action, evidence));
    },
  };
}
