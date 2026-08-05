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
} from "@hashgraph/sdk";
import { Interface } from "ethers";
import { vestraManagerAbi } from "../abi.ts";

const abi = new Interface(vestraManagerAbi);
export class HederaManager {
  readonly client: Client;
  readonly contractId: ContractId;
  constructor(contract: string, account: string, key: string) {
    this.contractId = ContractId.fromString(contract);
    this.client = Client.forTestnet()
      .setOperator(AccountId.fromString(account), PrivateKey.fromString(key))
      .setDefaultMaxTransactionFee(new Hbar(20));
  }
  async write(
    name: string,
    args: readonly unknown[],
    payableTinybars = 0,
  ): Promise<string> {
    try {
      const data = abi.encodeFunctionData(name, args);
      let tx = new ContractExecuteTransaction()
        .setContractId(this.contractId)
        .setGas(1_800_000)
        .setFunctionParameters(Buffer.from(data.slice(2), "hex"));
      if (payableTinybars)
        tx = tx.setPayableAmount(new Hbar(payableTinybars, HbarUnit.Tinybar));
      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      if (receipt.status !== Status.Success)
        throw new Error(`${name} failed: ${receipt.status.toString()}`);
      return response.transactionId.toString();
    } catch (error) {
      // Keep operational diagnostics server-side; never log keys or call arguments.
      console.error(`[Hedera write failed] ${name}`, error);
      throw error;
    }
  }
  async read(name: string, args: readonly unknown[]): Promise<any> {
    const data = abi.encodeFunctionData(name, args);
    const result = await new ContractCallQuery()
      .setContractId(this.contractId)
      .setGas(500_000)
      .setFunctionParameters(Buffer.from(data.slice(2), "hex"))
      .execute(this.client);
    return abi.decodeFunctionResult(name, result.bytes);
  }
}
