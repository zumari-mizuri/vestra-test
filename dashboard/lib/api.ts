import type { Asset, Association, Receipt } from "./types";
// The API is a separately deployed service. Its origin is public (not a
// credential); signing keys remain in the Render environment.
const base = (
  process.env.NEXT_PUBLIC_VESTRA_API_URL ?? "https://vestra-test.onrender.com"
).replace(/\/$/, "");
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
export const api = {
  assets: () => request<Asset[]>("/assets"),
  receipts: () => request<Receipt[]>("/receipts"),
  association: (id: string) =>
    request<Association>(`/assets/${id}/association`),
  createAsset: (body: unknown) =>
    request<Asset>("/admin/assets", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  importAsset: (body: unknown) =>
    request<Asset>("/admin/assets/import", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  changeAsset: (id: string, action: "suspend" | "resume" | "retire") =>
    request<Asset>(`/admin/assets/${id}/${action}`, { method: "POST" }),
  issueReceipt: (body: unknown) =>
    request<Receipt>("/admin/receipts", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  lifecycle: (
    id: string,
    action: "mature" | "redeem" | "default" | "revoke" | "correct",
    evidence: unknown,
  ) =>
    request<Receipt>(`/admin/receipts/${id}/${action}`, {
      method: "POST",
      body: JSON.stringify({ evidence }),
    }),
};
