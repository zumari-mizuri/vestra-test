import { join } from "node:path";
import cors from "cors";
import dotenv from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { VestraService } from "../core/vestra.service.ts";
import { adminRoutes } from "../route/admin.route.ts";
import { publicRoutes } from "../route/public.route.ts";
import { HederaManager } from "./hedera.ts";
import { Pinata } from "./pinata.ts";
import { Registry } from "./registry.ts";

// Prefer an integration-specific file, but let the repository .env support local scripts.
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH ?? join(process.cwd(), ".env") });
dotenv.config({ path: join(process.cwd(), "..", ".env"), override: false });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || "0.0.0.0";
const collectionFee = Number(required("COLLECTION_CREATE_TINYBARS"));
if (!Number.isSafeInteger(collectionFee) || collectionFee <= 0)
  throw new Error("COLLECTION_CREATE_TINYBARS must be a positive integer");

const registry = new Registry(required("MONGO_URI"));
const service = new VestraService(
  new HederaManager(
    required("VESTRA_CONTRACT_ID"),
    required("HEDERA_ADMIN_ID"),
    required("HEDERA_ADMIN_PRIVATE_KEY"),
  ),
  registry,
  new Pinata(required("PINATA_JWT_SECRET")),
  {
    adminId: required("HEDERA_ADMIN_ID"),
    contractId: required("VESTRA_CONTRACT_ID"),
    collectionFee,
  },
);

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));
app.use(express.json({ limit: "256kb" }));
app.use(publicRoutes(service));
app.use("/admin", adminRoutes(service));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Vestra API error]", error);
  const zod = error instanceof z.ZodError;
  const requestedStatus = typeof error === "object" && error && "status" in error
    ? Number((error as { status: unknown }).status)
    : undefined;
  const status = zod ? 400 : requestedStatus && requestedStatus >= 400 && requestedStatus <= 599 ? requestedStatus : 500;
  res.status(status).json({
    error: zod ? "Invalid request" : error instanceof Error ? error.message : "Internal server error",
    details: zod ? error.issues : undefined,
  });
});

async function start() {
  const mongo = await registry.connect();
  console.log(`MongoDB connected successfully (${mongo.host}/${mongo.database})`);
  app.listen(port, host, () => console.log(`Vestra admin API listening on http://${host}:${port}`));
}

void start().catch((error) => {
  console.error("MongoDB connection failed; API will not start", error);
  process.exitCode = 1;
});
