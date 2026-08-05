import type { Request, Response } from "express";
import type { VestraService } from "../core/vestra.service.ts";

const param = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value ?? "";

export function publicController(service: VestraService) {
  return {
    health: async (_req: Request, res: Response) => res.json(await service.health()),
    assets: async (_req: Request, res: Response) => res.json(await service.assets()),
    receipts: async (req: Request, res: Response) => {
      const assetClassId = typeof req.query.assetClassId === "string" ? req.query.assetClassId : undefined;
      res.json(await service.receipts(assetClassId));
    },
    asset: async (req: Request, res: Response) => res.json(await service.asset(param(req.params.assetClassId))),
    association: async (req: Request, res: Response) => res.json(await service.association(param(req.params.assetClassId))),
    receipt: async (req: Request, res: Response) => res.json(await service.receipt(param(req.params.receiptId))),
  };
}
