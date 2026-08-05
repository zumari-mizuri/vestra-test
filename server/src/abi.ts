export const vestraManagerAbi = [
  "function isAdmin(address account) view returns (bool)",
  "function createCollection(bytes32 assetClassId,string assetClassName,string tokenSymbol) payable returns (address tokenAddress)",
  "function suspendCollection(bytes32 assetClassId)",
  "function resumeCollection(bytes32 assetClassId)",
  "function retireCollection(bytes32 assetClassId)",
  "function getCollection(bytes32 assetClassId) view returns ((bytes32 assetClassId,address tokenAddress,string assetClassName,uint8 status) collection)",
  "function issueReceipt(bytes32 assetClassId,bytes32 receiptId,bytes32 instrumentRefHash,address recipient,bytes3 currency,uint64 purchaseAmountMinor,uint64 faceValueMinor,uint64 expectedInterestMinor,uint32 annualYieldBps,uint64 effectiveDate,uint64 maturityDate,bytes32 termsDocumentHash,bytes32 replacesReceiptId,string hip412MetadataUri) returns (int64 serialNumber)",
  "function markMatured(bytes32 receiptId,bytes32 evidenceHash)",
  "function markRedeemed(bytes32 receiptId,bytes32 evidenceHash)",
  "function markDefaulted(bytes32 receiptId,bytes32 evidenceHash)",
  "function markRevoked(bytes32 receiptId,bytes32 evidenceHash)",
  "function markCorrected(bytes32 receiptId,bytes32 evidenceHash)",
  "function getReceipt(bytes32 receiptId) view returns ((bytes32 receiptId,bytes32 assetClassId,bytes32 instrumentRefHash,address owner,address tokenAddress,int64 serialNumber,bytes3 currency,uint64 purchaseAmountMinor,uint64 faceValueMinor,uint64 expectedInterestMinor,uint32 annualYieldBps,uint64 effectiveDate,uint64 maturityDate,bytes32 termsDocumentHash,bytes32 metadataUriHash,bytes32 statusEvidenceHash,uint64 issuedAt,uint64 statusChangedAt,uint8 status,bytes32 replacesReceiptId) receipt)",
  "function getReplacementReceiptId(bytes32 correctedReceiptId) view returns (bytes32)"
] as const;
