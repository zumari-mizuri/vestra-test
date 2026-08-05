import { Router } from "express";
import type { VestraService } from "../core/vestra.service.ts";
import { adminController } from "../controller/admin.controller.ts";

export function adminRoutes(service: VestraService) {
  const controller = adminController(service);
  const router = Router()
    .post("/assets", controller.createAsset)
    .post("/assets/import", controller.importAsset)
    .post("/receipts", controller.issueReceipt);
  for (const action of ["suspend", "resume", "retire"])
    router.post(`/assets/:assetClassId/${action}`, controller.changeAsset(action));
  for (const action of ["mature", "redeem", "default", "revoke", "correct"])
    router.post(`/receipts/:receiptId/${action}`, controller.changeReceipt(action));
  return router;
}
