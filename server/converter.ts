import { PrivateKey } from "@hashgraph/sdk";
import dotenv from "dotenv";

dotenv.config();

/**
 * Converts a standard 32-byte EVM secp256k1 private key into the formats the
 * Hedera SDK accepts. This is local-only: it makes no network calls and writes
 * nothing to disk.
 *
 * Usage:
 *   EVM_PRIVATE_KEY=0x... npm run convert:key
 */
function main(): void {
  const input = process.env.HEDERA_INVESTOR_PRIVATE_KEY?.trim();
  if (!input) {
    throw new Error(
      "Set PRIVATE_KEY to a 32-byte EVM private key (for example: 0xabc...).",
    );
  }

  const raw = input.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      "PRIVATE_KEY must be exactly 32 bytes / 64 hexadecimal characters.",
    );
  }

  const privateKey = PrivateKey.fromStringECDSA(raw);
  const publicKey = privateKey.publicKey;

  console.log("Hedera ECDSA secp256k1 key material (local conversion only):\n");
  console.log(`Hedera private key (DER): ${privateKey.toStringDer()}`);
  console.log(`Hedera private key (raw):  ${privateKey.toStringRaw()}`);
  console.log(`Hedera public key (DER):  ${publicKey.toStringDer()}`);
  console.log(`Hedera public key (raw):  ${publicKey.toStringRaw()}`);
  console.log(`EVM address:               ${publicKey.toEvmAddress()}`);
  console.log(
    "\nKeep the private-key output secret. It controls the same key material as the EVM key.",
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
