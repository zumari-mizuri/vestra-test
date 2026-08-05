import { Router } from "express";
import type { VestraService } from "../core/vestra.service.ts";
import { publicController } from "../controller/public.controller.ts";

export function publicRoutes(service: VestraService) {
  const controller = publicController(service);
  return Router()
    .get("/health", controller.health)
    .get("/assets", controller.assets)
    .get("/receipts", controller.receipts)
    .get("/assets/:assetClassId", controller.asset)
    .get("/assets/:assetClassId/association", controller.association)
    .get("/receipts/:receiptId", controller.receipt);
}
