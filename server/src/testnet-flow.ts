import "dotenv/config";
import {
  AccountId,
  Client,
  ContractCallQuery,
  ContractExecuteTransaction,
  ContractId,
  Hbar,
  HbarUnit,
  PrivateKey,
  Status,
  TokenAssociateTransaction,
  TokenId,
} from "@hashgraph/sdk";
import { Interface, keccak256, toUtf8Bytes, zeroPadValue } from "ethers";
import { vestraManagerAbi } from "./abi.ts";

const abi = new Interface(vestraManagerAbi);
const GAS = { WRITE: 1_800_000, READ: 500_000 };
const STATUS = { ISSUED: 1, MATURED: 2, REDEEMED: 3 };
const COLLECTION = { ACTIVE: 1 };

type Config = {
  contractId: ContractId;
  adminId: AccountId;
  adminKey: PrivateKey;
  investorId: AccountId;
  investorKey: PrivateKey;
  metadataBaseUri: string;
  runId: string;
  collectionCreateTinybars: number;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

function config(): Config {
  if (process.env.CONFIRM_TESTNET_WRITES !== "YES") {
    throw new Error(
      "Set CONFIRM_TESTNET_WRITES=YES before making testnet writes.",
    );
  }
  const metadataBaseUri = required("HIP412_METADATA_BASE_URI").replace(
    /\/$/,
    "",
  );
  if (!metadataBaseUri.startsWith("ipfs://"))
    throw new Error("HIP412_METADATA_BASE_URI must start with ipfs://");
  const collectionCreateTinybars = Number(
    required("COLLECTION_CREATE_TINYBARS"),
  );
  if (
    !Number.isSafeInteger(collectionCreateTinybars) ||
    collectionCreateTinybars <= 0
  ) {
    throw new Error(
      "COLLECTION_CREATE_TINYBARS must be a positive safe integer",
    );
  }
  return {
    contractId: ContractId.fromString(required("VESTRA_CONTRACT_ID")),
    adminId: AccountId.fromString(required("HEDERA_ADMIN_ID")),
    adminKey: PrivateKey.fromString(required("HEDERA_ADMIN_PRIVATE_KEY")),
    investorId: AccountId.fromString(required("HEDERA_INVESTOR_ID")),
    investorKey: PrivateKey.fromString(required("HEDERA_INVESTOR_PRIVATE_KEY")),
    metadataBaseUri,
    runId: required("TEST_RUN_ID"),
    collectionCreateTinybars,
  };
}

function client(account: AccountId, key: PrivateKey): Client {
  return Client.forTestnet()
    .setOperator(account, key)
    .setDefaultMaxTransactionFee(new Hbar(20));
}

function hash(label: string, suffix: string): string {
  return keccak256(toUtf8Bytes(`vestra-testnet:${label}:${suffix}`));
}

function metadataUri(baseUri: string, label: string, suffix: string): string {
  const uri = `${baseUri}/receipt-${label}-${suffix}.json`;
  if (Buffer.byteLength(uri) > 100)
    throw new Error(`URI exceeds HTS's 100-byte limit: ${uri}`);
  return uri;
}

function issueArgs(
  assetClassId: string,
  receiptId: string,
  replacesReceiptId: string,
  uri: string,
  suffix: string,
  investor: string,
) {
  return [
    assetClassId,
    receiptId,
    hash("instrument", suffix),
    investor,
    "0x4e474e", // NGN
    200_000_000n,
    200_000_000n,
    33_126_319n,
    1700,
    1_742_342_400n,
    1_773_878_400n,
    hash("terms", `${receiptId}:${suffix}`),
    replacesReceiptId,
    uri,
  ] as const;
}

async function execute(
  client: Client,
  contractId: ContractId,
  name: string,
  args: readonly unknown[],
  payableTinybars = 0,
): Promise<void> {
  const data = abi.encodeFunctionData(name, args);
  let tx = new ContractExecuteTransaction()
    .setContractId(contractId)
    .setGas(GAS.WRITE)
    .setFunctionParameters(Buffer.from(data.slice(2), "hex"));
  if (payableTinybars)
    tx = tx.setPayableAmount(new Hbar(payableTinybars, HbarUnit.Tinybar));
  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
  if (receipt.status !== Status.Success)
    throw new Error(`${name} failed: ${receipt.status.toString()}`);
  console.log(`✓ ${name}: ${response.transactionId.toString()}`);
}

async function call(
  client: Client,
  contractId: ContractId,
  name: string,
  args: readonly unknown[],
) {
  const data = abi.encodeFunctionData(name, args);
  const result = await new ContractCallQuery()
    .setContractId(contractId)
    .setGas(GAS.READ)
    .setFunctionParameters(Buffer.from(data.slice(2), "hex"))
    .execute(client);
  return abi.decodeFunctionResult(name, result.bytes);
}

async function expectFailure(
  action: () => Promise<void>,
  label: string,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.log(
      `✓ expected failure (${label}): ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

async function associate(
  investorClient: Client,
  tokenAddress: string,
  investorId: AccountId,
): Promise<void> {
  const tokenId = TokenId.fromSolidityAddress(tokenAddress);
  try {
    const response = await new TokenAssociateTransaction()
      .setAccountId(investorId)
      .setTokenIds([tokenId])
      .execute(investorClient);
    const receipt = await response.getReceipt(investorClient);
    if (receipt.status !== Status.Success)
      throw new Error(`association failed: ${receipt.status.toString()}`);
    console.log(
      `✓ investor associated with ${tokenId.toString()}: ${response.transactionId.toString()}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT")) throw error;
    console.log(`✓ investor already associated with ${tokenId.toString()}`);
  }
}

async function main(): Promise<void> {
  const cfg = config();
  const adminClient = client(cfg.adminId, cfg.adminKey);
  const investorClient = client(cfg.investorId, cfg.investorKey);
  const suffix = cfg.runId;
  const assetClassId = hash("NIGERIAN_TBILL", suffix);
  const investorAddress = cfg.investorId.toSolidityAddress();
  const zeroBytes32 = zeroPadValue("0x", 32);

  try {
    const [admin] = await call(adminClient, cfg.contractId, "isAdmin", [
      cfg.adminId.toSolidityAddress(),
    ]);
    if (!admin) throw new Error("HEDERA_ADMIN_ID is not a VestraManager admin");

    await execute(
      adminClient,
      cfg.contractId,
      "createCollection",
      [assetClassId, `Vestra TBills ${suffix}`, `VTB${suffix.slice(-4)}`],
      cfg.collectionCreateTinybars,
    );
    const [collection] = await call(
      adminClient,
      cfg.contractId,
      "getCollection",
      [assetClassId],
    );
    const tokenAddress = collection.tokenAddress as string;
    if (Number(collection.status) !== COLLECTION.ACTIVE)
      throw new Error("collection is not ACTIVE");
    await associate(investorClient, tokenAddress, cfg.investorId);

    const primary = hash("primary", suffix);
    await execute(
      adminClient,
      cfg.contractId,
      "issueReceipt",
      issueArgs(
        assetClassId,
        primary,
        zeroBytes32,
        metadataUri(cfg.metadataBaseUri, "primary", suffix),
        suffix,
        investorAddress,
      ),
    );
    const [primaryRecord] = await call(
      adminClient,
      cfg.contractId,
      "getReceipt",
      [primary],
    );
    if (
      Number(primaryRecord.status) !== STATUS.ISSUED ||
      primaryRecord.owner.toLowerCase() !== investorAddress.toLowerCase()
    ) {
      throw new Error("issued receipt did not verify");
    }
    console.log(
      `✓ primary receipt serial: ${primaryRecord.serialNumber.toString()}`,
    );

    await execute(adminClient, cfg.contractId, "suspendCollection", [
      assetClassId,
    ]);
    await expectFailure(
      () =>
        execute(
          adminClient,
          cfg.contractId,
          "issueReceipt",
          issueArgs(
            assetClassId,
            hash("suspended", suffix),
            zeroBytes32,
            metadataUri(cfg.metadataBaseUri, "suspended", suffix),
            suffix,
            investorAddress,
          ),
        ),
      "issue while suspended",
    );
    await execute(adminClient, cfg.contractId, "resumeCollection", [
      assetClassId,
    ]);

    await execute(adminClient, cfg.contractId, "markMatured", [
      primary,
      hash("maturity-evidence", suffix),
    ]);
    await execute(adminClient, cfg.contractId, "markRedeemed", [
      primary,
      hash("redemption-evidence", suffix),
    ]);
    const [redeemed] = await call(adminClient, cfg.contractId, "getReceipt", [
      primary,
    ]);
    if (Number(redeemed.status) !== STATUS.REDEEMED)
      throw new Error("receipt did not redeem");

    const corrected = hash("corrected", suffix);
    await execute(
      adminClient,
      cfg.contractId,
      "issueReceipt",
      issueArgs(
        assetClassId,
        corrected,
        zeroBytes32,
        metadataUri(cfg.metadataBaseUri, "corrected", suffix),
        suffix,
        investorAddress,
      ),
    );
    await execute(adminClient, cfg.contractId, "markCorrected", [
      corrected,
      hash("correction-evidence", suffix),
    ]);
    await execute(
      adminClient,
      cfg.contractId,
      "issueReceipt",
      issueArgs(
        assetClassId,
        hash("replacement", suffix),
        corrected,
        metadataUri(cfg.metadataBaseUri, "replacement", suffix),
        suffix,
        investorAddress,
      ),
    );
    const [replacementLookup] = await call(
      adminClient,
      cfg.contractId,
      "getReplacementReceiptId",
      [corrected],
    );
    if (replacementLookup.toLowerCase() !== hash("replacement", suffix).toLowerCase()) {
      throw new Error("replacement lookup did not return the issued replacement");
    }
    await expectFailure(
      () =>
        execute(
          adminClient,
          cfg.contractId,
          "issueReceipt",
          issueArgs(
            assetClassId,
            hash("duplicate-replacement", suffix),
            corrected,
            metadataUri(cfg.metadataBaseUri, "duplicate-replacement", suffix),
            suffix,
            investorAddress,
          ),
        ),
      "a second direct replacement",
    );

    for (const [label, method] of [
      ["default", "markDefaulted"],
      ["revoked", "markRevoked"],
    ] as const) {
      const receiptId = hash(label, suffix);
      await execute(
        adminClient,
        cfg.contractId,
        "issueReceipt",
        issueArgs(
          assetClassId,
          receiptId,
          zeroBytes32,
          metadataUri(cfg.metadataBaseUri, label, suffix),
          suffix,
          investorAddress,
        ),
      );
      await execute(adminClient, cfg.contractId, method, [
        receiptId,
        hash(`${label}-evidence`, suffix),
      ]);
    }

    await execute(adminClient, cfg.contractId, "retireCollection", [
      assetClassId,
    ]);
    await expectFailure(
      () =>
        execute(adminClient, cfg.contractId, "resumeCollection", [
          assetClassId,
        ]),
      "resume a retired collection",
    );
    console.log("\nFull Vestra testnet flow completed successfully.");
  } finally {
    adminClient.close();
    investorClient.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
