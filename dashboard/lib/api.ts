import type { Asset, Association, Receipt } from "./types";
// Production calls can go directly to the separately deployed API. This is a
// public URL (never a secret), and the API restricts browser origins with its
// CORS_ORIGINS allowlist. Local development retains the Next.js proxy fallback.
const base = (process.env.NEXT_PUBLIC_VESTRA_API_URL ?? "/backend").replace(/\/$/, "");
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
