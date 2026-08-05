import { keccak256, toUtf8Bytes, zeroPadValue } from "ethers";

export const ZERO_BYTES32 = zeroPadValue("0x", 32);

/** IDs are domain-separated so a value cannot be reused across record types. */
export function assetClassId(assetClassKey: string): string {
  return keccak256(toUtf8Bytes(`vestra:asset-class:v1:${assetClassKey}`));
}

export function receiptId(publicId: string): string {
  return keccak256(toUtf8Bytes(`vestra:receipt:v1:${publicId}`));
}

export function secretHash(kind: "instrument" | "terms" | "evidence", value: unknown): string {
  return keccak256(toUtf8Bytes(`vestra:${kind}:v1:${canonicalJson(value)}`));
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("JSON value must be finite");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new Error("Value must be JSON-serializable");
}

export function currencyBytes3(currency: string): string {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("currency must be a three-letter uppercase code");
  return `0x${Buffer.from(currency, "ascii").toString("hex")}`;
}
