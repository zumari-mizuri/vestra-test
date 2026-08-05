"use client";
import { useEffect, useMemo, useState } from "react";
import {
  useAppKit,
  useAppKitAccount,
  useAppKitNetwork,
} from "@reown/appkit/react";
import { useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Asset, Receipt } from "@/lib/types";
import { Button, Badge, Card } from "./ui";
import { wagmiAdapter } from "@/lib/wallet";

type Mode = "user" | "admin";
const formatAmount = (minor: string, currency: string) =>
  `${currency} ${(BigInt(minor) / 100n).toLocaleString()}.${(BigInt(minor) % 100n).toString().padStart(2, "0")}`;
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const HTS_SYSTEM_CONTRACT =
  "0x0000000000000000000000000000000000000167" as const;
const htsAssociationAbi = [
  {
    type: "function",
    name: "associateToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "responseCode", type: "int64" }],
  },
] as const;
const tenors = [
  { days: 91, yieldBps: 1500, label: "91 days · 15.00%" },
  { days: 182, yieldBps: 1600, label: "182 days · 16.00%" },
  { days: 364, yieldBps: 1700, label: "364 days · 17.00%" },
] as const;
function nairaToMinor(value: string): bigint {
  const match = value
    .trim()
    .replace(/,/g, "")
    .match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match)
    throw new Error("Enter a valid NGN amount, for example 2000000.00");
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}
const hashscanTransaction = (transactionId: string) =>
  `https://hashscan.io/testnet/transaction/${encodeURIComponent(transactionId)}`;
const ipfsGateway = (uri: string) =>
  uri.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${uri.slice(7)}` : uri;
async function verifyAssociation(
  account: string,
  tokenId: string,
): Promise<boolean> {
  const mirror =
    process.env.NEXT_PUBLIC_MIRROR_NODE_URL ??
    "https://testnet.mirrornode.hedera.com/api/v1";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(
      `${mirror}/accounts/${account}/tokens?token.id=${tokenId}`,
    );
    if (response.ok) {
      const body = (await response.json()) as { tokens?: unknown[] };
      if (body.tokens?.length) return true;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1_000));
  }
  return false;
}
export function Dashboard() {
  const [mode, setMode] = useState<Mode>("user"),
    [assets, setAssets] = useState<Asset[]>([]),
    [receipts, setReceipts] = useState<Receipt[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [nextAssets, nextReceipts] = await Promise.all([
        api.assets(),
        api.receipts(),
      ]);
      setAssets(nextAssets);
      setReceipts(nextReceipts);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load the Vestra API",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
      <Header mode={mode} setMode={setMode} />
      <div className="mt-8 flex flex-1 flex-col gap-6">
        {error ? (
          <ErrorState message={error} retry={load} />
        ) : loading ? (
          <Skeletons />
        ) : mode === "user" ? (
          <UserMode
            assets={assets.filter((asset) => asset.status === "ACTIVE")}
          />
        ) : (
          <AdminMode assets={assets} receipts={receipts} done={load} />
        )}
      </div>
    </main>
  );
}
function Header({
  mode,
  setMode,
}: {
  mode: Mode;
  setMode: (mode: Mode) => void;
}) {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { chainId } = useAppKitNetwork();
  return (
    <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
          <ShieldCheck aria-hidden="true" />
        </div>
        <div>
          <p className="text-lg font-semibold">Vestra</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Custodial RWA receipts
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex rounded-md border bg-[hsl(var(--muted))] p-1"
          role="tablist"
          aria-label="Dashboard mode"
        >
          {(["user", "admin"] as const).map((item) => (
            <button
              key={item}
              role="tab"
              aria-selected={mode === item}
              onClick={() => setMode(item)}
              className={`min-h-10 rounded px-4 text-sm font-medium capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] ${mode === item ? "bg-[hsl(var(--card))] shadow-sm" : "text-[hsl(var(--muted-foreground))]"}`}
            >
              {item}
            </button>
          ))}
        </div>
        <Badge tone={chainId === 296 ? "good" : "warn"}>
          {chainId === 296 ? "Testnet" : "Switch to testnet"}
        </Badge>
        <Button variant="secondary" onClick={() => open()}>
          {isConnected && address ? (
            short(address)
          ) : (
            <>
              <Wallet className="mr-2 size-4" aria-hidden="true" />
              Connect wallet
            </>
          )}
        </Button>
      </div>
    </header>
  );
}
function UserMode({ assets }: { assets: Asset[] }) {
  const { address, isConnected } = useAppKitAccount();
  return (
    <>
      <section className="flex max-w-3xl flex-col gap-2">
        <Badge tone="good">Available asset classes</Badge>
      </section>
      {assets.length === 0 ? (
        <Empty
          title="No asset classes are available"
          text="Check back after Vestra enables an investment product."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {assets.map((asset) => (
            <AssetCard
              key={asset.assetClassId}
              asset={asset}
              connected={isConnected}
              wallet={address}
            />
          ))}
        </div>
      )}
    </>
  );
}
function AssetCard({
  asset,
  connected,
  wallet,
}: {
  asset: Asset;
  connected: boolean;
  wallet?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [associated, setAssociated] = useState(false);
  const [amount, setAmount] = useState("2000000.00");
  const [tenorIndex, setTenorIndex] = useState(2);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const { writeContractAsync } = useWriteContract();
  const close = () => {
    if (!busy) setOpen(false);
  };
  useEffect(() => {
    if (!connected || !wallet) return;
    void (async () => {
      try {
        const details = await api.association(asset.assetClassId);
        setAssociated(await verifyAssociation(wallet, details.tokenId));
      } catch {
        setAssociated(false);
      }
    })();
  }, [asset.assetClassId, connected, wallet]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy]);
  const purchase = async () => {
    if (!wallet) {
      setError("Connect your Hedera EVM wallet first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const details = await api.association(asset.assetClassId);
      if (!associated) {
        const hash = await writeContractAsync({
          address: HTS_SYSTEM_CONTRACT,
          abi: htsAssociationAbi,
          functionName: "associateToken",
          args: [
            wallet as `0x${string}`,
            details.tokenAddress as `0x${string}`,
          ],
          chainId: 296,
        });
        const confirmation = await waitForTransactionReceipt(
          wagmiAdapter.wagmiConfig,
          { hash },
        );
        if (
          confirmation.status !== "success" ||
          !(await verifyAssociation(wallet, details.tokenId))
        )
          throw new Error(
            "Collection association did not complete. Check the wallet transaction and retry.",
          );
        setAssociated(true);
      }
      const terms = tenors[tenorIndex];
      const purchaseAmountMinor = nairaToMinor(amount);
      const effectiveDate = Math.floor(Date.now() / 1_000);
      const expectedInterestMinor =
        (purchaseAmountMinor * BigInt(terms.yieldBps) * BigInt(terms.days)) /
        365n /
        10_000n;
      const issued = await api.issueReceipt({
        assetClassId: asset.assetClassId,
        recipient: wallet,
        currency: "NGN",
        purchaseAmountMinor: purchaseAmountMinor.toString(),
        faceValueMinor: purchaseAmountMinor.toString(),
        expectedInterestMinor: expectedInterestMinor.toString(),
        annualYieldBps: terms.yieldBps,
        effectiveDate,
        maturityDate: effectiveDate + terms.days * 24 * 60 * 60,
        instrumentReference: `testnet-purchase:${asset.assetClassId}:${wallet}:${effectiveDate}`,
        termsDocument: {
          schema: "vestra.receipt/testnet-purchase/1",
          assetClass: asset.assetClassKey,
          tenorDays: terms.days,
          disclaimer:
            "Testnet demonstration only; no investment or custody entitlement.",
        },
      });
      setReceipt(issued);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete test purchase",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Card className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{asset.name}</h2>
            <Badge tone="good">{asset.status}</Badge>
          </div>
          <p className="max-w-prose text-sm text-[hsl(var(--muted-foreground))]">
            {asset.description}
          </p>
          <p className="break-all font-mono text-xs text-[hsl(var(--muted-foreground))]">
            Collection: {asset.tokenAddress}
          </p>
        </div>
        <Button
          onClick={() => {
            setOpen(true);
            setError("");
            setReceipt(null);
          }}
        >
          Purchase
        </Button>
      </Card>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50 p-4 sm:items-center sm:justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`purchase-${asset.assetClassId}`}
        >
          <Card className="max-h-full w-full max-w-lg overflow-y-auto">
            <div className="flex flex-col gap-4">
              <div>
                <Badge tone="good">Testnet purchase</Badge>
                <h2
                  id={`purchase-${asset.assetClassId}`}
                  className="mt-2 text-xl font-semibold"
                >
                  Purchase {asset.name}
                </h2>
              </div>
              {receipt ? (
                <div className="flex flex-col gap-4">
                  <a
                    href={hashscanTransaction(receipt.transactionId ?? "")}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    aria-label="Open this receipt transaction in HashScan"
                  >
                    <img
                      src={ipfsGateway(receipt.imageUri)}
                      alt={`Vestra receipt ${receipt.publicId}; open its transaction in HashScan`}
                      className="aspect-video w-full object-cover"
                    />
                  </a>
                  <div>
                    <p className="font-medium">Receipt minted</p>
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      Serial {receipt.serialNumber}
                    </p>
                    <a
                      href={hashscanTransaction(receipt.transactionId ?? "")}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block break-all font-mono text-xs font-medium underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    >
                      {receipt.transactionId}
                    </a>
                    <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                      Transaction ID ·
                    </p>
                  </div>
                  <Button onClick={close}>Done</Button>
                </div>
              ) : (
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void purchase();
                  }}
                >
                  <label
                    className="flex flex-col gap-1.5 text-sm font-medium"
                    htmlFor={`tenor-${asset.assetClassId}`}
                  >
                    Tenor
                    <select
                      id={`tenor-${asset.assetClassId}`}
                      value={tenorIndex}
                      onChange={(event) =>
                        setTenorIndex(Number(event.target.value))
                      }
                      className="min-h-10 rounded-md border bg-transparent px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    >
                      {tenors.map((tenor, index) => (
                        <option key={tenor.days} value={index}>
                          {tenor.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    className="flex flex-col gap-1.5 text-sm font-medium"
                    htmlFor={`amount-${asset.assetClassId}`}
                  >
                    Amount to invest (NGN)
                    <input
                      id={`amount-${asset.assetClassId}`}
                      required
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="2000000.00"
                      className="min-h-10 rounded-md border bg-transparent px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    />
                  </label>
                  {error && (
                    <p
                      role="alert"
                      className="text-sm text-red-700 dark:text-red-300"
                    >
                      {error}
                    </p>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={close}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={busy} aria-busy={busy}>
                      {busy ? "Processing purchase…" : "Purchase"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
function AdminMode({
  assets,
  receipts,
  done,
}: {
  assets: Asset[];
  receipts: Receipt[];
  done: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <Badge>Local admin workspace</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">
          Manage asset collections and receipts.
        </h1>
        <p className="text-[hsl(var(--muted-foreground))]">
          Each action is signed by the local Express service’s configured admin
          account.
        </p>
      </section>
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <AssetForm done={done} />
          <ReceiptForm assets={assets} done={done} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <AdminRecords assets={assets} receipts={receipts} done={done} />
        </div>
      </div>
    </div>
  );
}
function AssetForm({ done }: { done: () => Promise<void> }) {
  const [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true);
    setMessage("");
    const data = Object.fromEntries(new FormData(form));
    try {
      await api.createAsset(data);
      form.reset();
      setMessage("Collection created.");
      await done();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not create collection",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <h2 className="text-lg font-semibold">Create asset collection</h2>
      <form className="mt-4 flex flex-col gap-4" onSubmit={submit}>
        <Fields
          fields={[
            ["assetClassKey", "Asset class key", "NIGERIAN_TBILL"],
            ["name", "Name", "Nigerian Treasury Bill"],
            ["symbol", "Symbol", "VTB"],
            ["imageUri", "IPFS image URI", "ipfs://…"],
            [
              "description",
              "Description",
              "Custodial Nigerian Treasury Bill receipts.",
            ],
          ]}
        />
        <Button type="submit" disabled={saving} aria-busy={saving}>
          {saving ? "Creating…" : "Create collection"}
        </Button>
        {message && (
          <Result
            message={message}
            success={message === "Collection created."}
          />
        )}
      </form>
    </Card>
  );
}
function ReceiptForm({
  assets,
  done,
}: {
  assets: Asset[];
  done: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true);
    setMessage("");
    const raw = Object.fromEntries(new FormData(form));
    const body = {
      ...raw,
      annualYieldBps: Number(raw.annualYieldBps),
      effectiveDate: Math.floor(
        new Date(String(raw.effectiveDate)).getTime() / 1000,
      ),
      maturityDate: Math.floor(
        new Date(String(raw.maturityDate)).getTime() / 1000,
      ),
      termsDocument: { schema: "vestra.receipt/v1" },
    };
    try {
      await api.issueReceipt(body);
      form.reset();
      setMessage("Receipt issued.");
      await done();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not issue receipt",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <h2 className="text-lg font-semibold">Issue receipt</h2>
      {assets.filter((asset) => asset.status === "ACTIVE").length === 0 ? (
        <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
          Create or import an active collection first.
        </p>
      ) : (
        <form className="mt-4 flex flex-col gap-4" onSubmit={submit}>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Asset collection
            <select
              required
              name="assetClassId"
              className="min-h-10 rounded-md border bg-transparent px-3"
            >
              <option value="">Select collection</option>
              {assets
                .filter((asset) => asset.status === "ACTIVE")
                .map((asset) => (
                  <option key={asset.assetClassId} value={asset.assetClassId}>
                    {asset.name}
                  </option>
                ))}
            </select>
          </label>
          <Fields
            fields={[
              ["recipient", "Recipient EVM address", "0x…"],
              ["currency", "Currency", "NGN"],
              [
                "purchaseAmountMinor",
                "Purchase amount (minor units)",
                "200000000",
              ],
              ["faceValueMinor", "Face value (minor units)", "200000000"],
              [
                "expectedInterestMinor",
                "Expected interest (minor units)",
                "33126319",
              ],
              ["annualYieldBps", "Annual yield (basis points)", "1700"],
              ["effectiveDate", "Effective date", ""],
              ["maturityDate", "Maturity date", ""],
              [
                "instrumentReference",
                "Internal instrument reference",
                "Internal only",
              ],
            ]}
            dates={["effectiveDate", "maturityDate"]}
          />
          <Button type="submit" disabled={saving} aria-busy={saving}>
            {saving ? "Issuing…" : "Issue receipt"}
          </Button>
          {message && (
            <Result message={message} success={message === "Receipt issued."} />
          )}
        </form>
      )}
    </Card>
  );
}
function Fields({
  fields,
  dates = [],
}: {
  fields: string[][];
  dates?: string[];
}) {
  return (
    <>
      {fields.map(([name, label, placeholder]) => (
        <label key={name} className="flex flex-col gap-1.5 text-sm font-medium">
          {label}
          <input
            required
            name={name}
            type={dates.includes(name) ? "date" : "text"}
            inputMode={/Amount|yield/.test(label) ? "numeric" : undefined}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            className="min-h-10 rounded-md border bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          />
        </label>
      ))}
    </>
  );
}
function AdminRecords({
  assets,
  receipts,
  done,
}: {
  assets: Asset[];
  receipts: Receipt[];
  done: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="text-lg font-semibold">Collections</h2>
        <div className="mt-4 flex flex-col gap-3">
          {assets.length ? (
            assets.map((asset) => (
              <div
                key={asset.assetClassId}
                className="flex flex-col gap-3 rounded-md border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{asset.name}</span>
                  <Badge
                    tone={
                      asset.status === "ACTIVE"
                        ? "good"
                        : asset.status === "SUSPENDED"
                          ? "warn"
                          : "bad"
                    }
                  >
                    {asset.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {asset.status === "ACTIVE" && (
                    <Action
                      label="Suspend"
                      action={() =>
                        api.changeAsset(asset.assetClassId, "suspend")
                      }
                      done={done}
                    />
                  )}
                  {asset.status !== "RETIRED" && (
                    <Action
                      label={asset.status === "SUSPENDED" ? "Resume" : "Retire"}
                      destructive={asset.status === "ACTIVE"}
                      action={() =>
                        api.changeAsset(
                          asset.assetClassId,
                          asset.status === "SUSPENDED" ? "resume" : "retire",
                        )
                      }
                      done={done}
                    />
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              No collections yet.
            </p>
          )}
        </div>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Receipts</h2>
        <div className="mt-4 flex flex-col gap-3">
          {receipts.length ? (
            receipts.map((receipt) => (
              <div
                key={receipt.receiptId}
                className="flex flex-col gap-3 rounded-md border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {formatAmount(
                        receipt.purchaseAmountMinor,
                        receipt.currency,
                      )}
                    </p>
                    <p className="font-mono text-xs text-[hsl(var(--muted-foreground))]">
                      {short(receipt.receiptId)}
                    </p>
                  </div>
                  <Badge>{receipt.status}</Badge>
                </div>
                {["ISSUED", "MATURED"].includes(receipt.status) && (
                  <div className="flex flex-wrap gap-2">
                    {receipt.status === "ISSUED" && (
                      <Action
                        label="Mature"
                        action={() =>
                          api.lifecycle(receipt.receiptId, "mature", {
                            source: "dashboard",
                          })
                        }
                        done={done}
                      />
                    )}
                    <Action
                      label="Redeem"
                      destructive
                      action={() =>
                        api.lifecycle(receipt.receiptId, "redeem", {
                          source: "dashboard",
                        })
                      }
                      done={done}
                    />
                    <Action
                      label="Correct"
                      destructive
                      action={() =>
                        api.lifecycle(receipt.receiptId, "correct", {
                          source: "dashboard",
                        })
                      }
                      done={done}
                    />
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              No receipts yet.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
function Action({
  label,
  action,
  done,
  destructive = false,
}: {
  label: string;
  action: () => Promise<unknown>;
  done: () => Promise<void>;
  destructive?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={destructive ? "destructive" : "secondary"}
      onClick={async () => {
        if (
          destructive &&
          !window.confirm(`${label} is a terminal lifecycle action. Continue?`)
        )
          return;
        setBusy(true);
        try {
          await action();
          await done();
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
    >
      {busy ? "Working…" : label}
    </Button>
  );
}
function Result({ message, success }: { message: string; success: boolean }) {
  return (
    <p
      className={
        success
          ? "text-sm text-emerald-700 dark:text-emerald-300"
          : "text-sm text-red-700 dark:text-red-300"
      }
    >
      {message}
    </p>
  );
}
function Skeletons() {
  return (
    <div className="flex flex-col gap-4">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-36 animate-pulse rounded-lg bg-[hsl(var(--muted))]"
        />
      ))}
    </div>
  );
}
function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry: () => Promise<void>;
}) {
  return (
    <Card className="flex flex-col items-start gap-3 border-red-500/30">
      <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
        <AlertCircle className="size-5" aria-hidden="true" />
        <p className="font-medium">Couldn’t load the Vestra API</p>
      </div>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">{message}</p>
      <Button variant="secondary" onClick={() => void retry()}>
        <RefreshCw className="mr-2 size-4" aria-hidden="true" />
        Try again
      </Button>
    </Card>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center">
      <CheckCircle2
        className="size-10 text-[hsl(var(--muted-foreground))]"
        aria-hidden="true"
      />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          {text}
        </p>
      </div>
    </Card>
  );
}
