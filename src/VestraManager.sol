// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {IHederaTokenService} from "./interfaces/IHederaTokenService.sol";

/// @title VestraManager
/// @notice Issues non-transferable native Hedera NFT receipts for custodially
///         held Vestra investment products.
/// @dev The NFT metadata is an immutable HIP-412 IPFS URI. Private customer,
///      bank, custody, tax, payment, and settlement data never belongs here.
contract VestraManager {
    int64 public constant HTS_SUCCESS = 22;
    int64 public constant DEFAULT_AUTO_RENEW_PERIOD = 7_776_000;

    uint256 private constant KEY_TYPE_FREEZE = 4;
    uint256 private constant KEY_TYPE_SUPPLY = 16;
    uint256 private constant MAX_HTS_NFT_METADATA_BYTES = 100;

    bytes32 private constant OP_CREATE_COLLECTION = bytes32("CREATE_COLLECTION");
    bytes32 private constant OP_MINT = bytes32("MINT");
    bytes32 private constant OP_TRANSFER_NFT = bytes32("TRANSFER_NFT");
    bytes32 private constant OP_FREEZE = bytes32("FREEZE");
    bytes32 private constant OP_UNFREEZE = bytes32("UNFREEZE");

    enum CollectionStatus {
        NONE,
        ACTIVE,
        SUSPENDED,
        RETIRED
    }

    enum ReceiptStatus {
        NONE,
        ISSUED,
        MATURED,
        REDEEMED,
        DEFAULTED,
        REVOKED,
        CORRECTED
    }

    struct Collection {
        bytes32 assetClassId;
        address tokenAddress;
        string assetClassName;
        CollectionStatus status;
    }

    /// @notice Public, immutable economic terms and current lifecycle state.
    struct Receipt {
        bytes32 receiptId;
        bytes32 assetClassId;
        bytes32 instrumentRefHash;
        address owner;
        address tokenAddress;
        int64 serialNumber;
        bytes3 currency;
        uint64 purchaseAmountMinor;
        uint64 faceValueMinor;
        uint64 expectedInterestMinor;
        uint32 annualYieldBps;
        uint64 effectiveDate;
        uint64 maturityDate;
        bytes32 termsDocumentHash;
        bytes32 metadataUriHash;
        bytes32 statusEvidenceHash;
        uint64 issuedAt;
        uint64 statusChangedAt;
        ReceiptStatus status;
        bytes32 replacesReceiptId;
    }

    IHederaTokenService public immutable HTS;
    address public owner;
    mapping(address => bool) private _admins;
    mapping(bytes32 => Collection) private _collections;
    mapping(bytes32 => Receipt) private _receipts;
    mapping(bytes32 => bytes32) private _replacementReceiptIds;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AdminAdded(address indexed admin, address indexed operator);
    event AdminRemoved(address indexed admin, address indexed operator);
    event CollectionCreated(bytes32 indexed assetClassId, address indexed tokenAddress, string assetClassName);
    event CollectionStatusChanged(
        bytes32 indexed assetClassId,
        CollectionStatus previousStatus,
        CollectionStatus newStatus,
        address indexed operator
    );
    event ReceiptIssued(
        bytes32 indexed receiptId,
        bytes32 indexed assetClassId,
        address indexed receiptOwner,
        address tokenAddress,
        int64 serialNumber,
        bytes32 termsDocumentHash,
        bytes32 metadataUriHash,
        bytes32 replacesReceiptId,
        string hip412MetadataUri
    );
    event ReceiptStatusChanged(
        bytes32 indexed receiptId,
        ReceiptStatus previousStatus,
        ReceiptStatus newStatus,
        bytes32 statusEvidenceHash,
        uint64 changedAt,
        address indexed operator
    );

    error UnauthorizedOwner(address caller);
    error UnauthorizedAdmin(address caller);
    error ZeroAddress();
    error EmptyBytes32();
    error InvalidText();
    error InvalidCurrency();
    error InvalidAmounts();
    error InvalidDates();
    error InvalidMetadataUri();
    error CollectionAlreadyExists(bytes32 assetClassId);
    error CollectionNotFound(bytes32 assetClassId);
    error CollectionNotActive(bytes32 assetClassId, CollectionStatus current);
    error InvalidCollectionTransition(CollectionStatus current, CollectionStatus requested);
    error ReceiptAlreadyExists(bytes32 receiptId);
    error ReceiptNotFound(bytes32 receiptId);
    error InvalidReceiptStatus(bytes32 receiptId, ReceiptStatus current, ReceiptStatus requested);
    error MissingStatusEvidence();
    error InvalidReplacement(bytes32 replacesReceiptId);
    error ReplacementAlreadyIssued(bytes32 originalReceiptId, bytes32 replacementReceiptId);
    error ReplacementOwnerMismatch(address originalOwner, address replacementOwner);
    error InvalidSerialNumber();
    error AdminAlreadyExists(address admin);
    error AdminNotFound(address admin);
    error HtsOperationFailed(bytes32 operation, int64 responseCode);

    modifier onlyOwner() {
        if (msg.sender != owner) revert UnauthorizedOwner(msg.sender);
        _;
    }

    modifier onlyAdmin() {
        if (!isAdmin(msg.sender)) revert UnauthorizedAdmin(msg.sender);
        _;
    }

    /// @param htsAddress Hedera HTS precompile (0x167 in production), injected
    ///        to permit deterministic local HTS mock tests.
    constructor(address htsAddress) {
        if (htsAddress == address(0)) revert ZeroAddress();
        HTS = IHederaTokenService(htsAddress);
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    receive() external payable {}

    function isAdmin(address account) public view returns (bool) {
        return account == owner || _admins[account];
    }

    function addAdmin(address admin) external onlyOwner {
        if (admin == address(0)) revert ZeroAddress();
        if (isAdmin(admin)) revert AdminAlreadyExists(admin);
        _admins[admin] = true;
        emit AdminAdded(admin, msg.sender);
    }

    function removeAdmin(address admin) external onlyOwner {
        if (!_admins[admin]) revert AdminNotFound(admin);
        delete _admins[admin];
        emit AdminRemoved(admin, msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function createCollection(bytes32 assetClassId, string calldata assetClassName, string calldata tokenSymbol)
        external
        payable
        onlyAdmin
        returns (address tokenAddress)
    {
        _requireNonZero(assetClassId);
        if (_collections[assetClassId].tokenAddress != address(0)) revert CollectionAlreadyExists(assetClassId);
        _validateText(assetClassName);
        _validateText(tokenSymbol);

        IHederaTokenService.HederaToken memory token;
        token.name = assetClassName;
        token.symbol = tokenSymbol;
        token.treasury = address(this);
        token.memo = "Vestra RWA receipt";
        token.tokenSupplyType = false;
        token.maxSupply = 0;
        token.freezeDefault = true;
        token.tokenKeys = _buildTokenKeys();
        token.expiry = IHederaTokenService.Expiry({
            second: 0,
            autoRenewAccount: address(this),
            autoRenewPeriod: DEFAULT_AUTO_RENEW_PERIOD
        });

        int64 responseCode;
        (responseCode, tokenAddress) = HTS.createNonFungibleToken{value: msg.value}(token);
        _requireHtsSuccess(OP_CREATE_COLLECTION, responseCode);

        _collections[assetClassId] = Collection({
            assetClassId: assetClassId,
            tokenAddress: tokenAddress,
            assetClassName: assetClassName,
            status: CollectionStatus.ACTIVE
        });
        emit CollectionCreated(assetClassId, tokenAddress, assetClassName);
    }

    function suspendCollection(bytes32 assetClassId) external onlyAdmin {
        _changeCollectionStatus(assetClassId, CollectionStatus.SUSPENDED);
    }

    function resumeCollection(bytes32 assetClassId) external onlyAdmin {
        _changeCollectionStatus(assetClassId, CollectionStatus.ACTIVE);
    }

    function retireCollection(bytes32 assetClassId) external onlyAdmin {
        _changeCollectionStatus(assetClassId, CollectionStatus.RETIRED);
    }

    /// @notice Atomically stores, mints, delivers, and freezes one receipt NFT.
    function issueReceipt(
        bytes32 assetClassId,
        bytes32 receiptId,
        bytes32 instrumentRefHash,
        address recipient,
        bytes3 currency,
        uint64 purchaseAmountMinor,
        uint64 faceValueMinor,
        uint64 expectedInterestMinor,
        uint32 annualYieldBps,
        uint64 effectiveDate,
        uint64 maturityDate,
        bytes32 termsDocumentHash,
        bytes32 replacesReceiptId,
        string calldata hip412MetadataUri
    ) external onlyAdmin returns (int64 serialNumber) {
        Collection storage collection = _requireActiveCollection(assetClassId);
        _validateIssueInput(
            receiptId,
            instrumentRefHash,
            recipient,
            currency,
            purchaseAmountMinor,
            faceValueMinor,
            effectiveDate,
            maturityDate,
            termsDocumentHash,
            hip412MetadataUri
        );
        if (_receipts[receiptId].status != ReceiptStatus.NONE) revert ReceiptAlreadyExists(receiptId);
        _validateReplacement(replacesReceiptId, recipient);

        bytes[] memory metadata = new bytes[](1);
        metadata[0] = bytes(hip412MetadataUri);
        int64 responseCode;
        int64[] memory serialNumbers;
        (responseCode,, serialNumbers) = HTS.mintToken(collection.tokenAddress, 0, metadata);
        _requireHtsSuccess(OP_MINT, responseCode);
        if (serialNumbers.length != 1 || serialNumbers[0] <= 0) revert InvalidSerialNumber();
        serialNumber = serialNumbers[0];

        responseCode = HTS.unfreezeToken(collection.tokenAddress, recipient);
        _requireHtsSuccess(OP_UNFREEZE, responseCode);
        responseCode = HTS.transferNFT(collection.tokenAddress, address(this), recipient, serialNumber);
        _requireHtsSuccess(OP_TRANSFER_NFT, responseCode);
        responseCode = HTS.freezeToken(collection.tokenAddress, recipient);
        _requireHtsSuccess(OP_FREEZE, responseCode);

        uint64 issuedAt = uint64(block.timestamp);
        _receipts[receiptId] = Receipt({
            receiptId: receiptId,
            assetClassId: assetClassId,
            instrumentRefHash: instrumentRefHash,
            owner: recipient,
            tokenAddress: collection.tokenAddress,
            serialNumber: serialNumber,
            currency: currency,
            purchaseAmountMinor: purchaseAmountMinor,
            faceValueMinor: faceValueMinor,
            expectedInterestMinor: expectedInterestMinor,
            annualYieldBps: annualYieldBps,
            effectiveDate: effectiveDate,
            maturityDate: maturityDate,
            termsDocumentHash: termsDocumentHash,
            metadataUriHash: keccak256(bytes(hip412MetadataUri)),
            statusEvidenceHash: bytes32(0),
            issuedAt: issuedAt,
            statusChangedAt: issuedAt,
            status: ReceiptStatus.ISSUED,
            replacesReceiptId: replacesReceiptId
        });
        if (replacesReceiptId != bytes32(0)) {
            _replacementReceiptIds[replacesReceiptId] = receiptId;
        }
        emit ReceiptIssued(
            receiptId,
            assetClassId,
            recipient,
            collection.tokenAddress,
            serialNumber,
            termsDocumentHash,
            keccak256(bytes(hip412MetadataUri)),
            replacesReceiptId,
            hip412MetadataUri
        );
        emit ReceiptStatusChanged(receiptId, ReceiptStatus.NONE, ReceiptStatus.ISSUED, bytes32(0), issuedAt, msg.sender);
    }

    function markMatured(bytes32 receiptId, bytes32 evidenceHash) external onlyAdmin {
        _transitionReceipt(receiptId, ReceiptStatus.MATURED, evidenceHash);
    }

    function markRedeemed(bytes32 receiptId, bytes32 evidenceHash) external onlyAdmin {
        Receipt storage receipt = _requireReceipt(receiptId);
        if (receipt.status != ReceiptStatus.ISSUED && receipt.status != ReceiptStatus.MATURED) {
            revert InvalidReceiptStatus(receiptId, receipt.status, ReceiptStatus.REDEEMED);
        }
        _setReceiptStatus(receipt, ReceiptStatus.REDEEMED, evidenceHash);
    }

    function markDefaulted(bytes32 receiptId, bytes32 evidenceHash) external onlyAdmin {
        _transitionReceipt(receiptId, ReceiptStatus.DEFAULTED, evidenceHash);
    }

    function markRevoked(bytes32 receiptId, bytes32 evidenceHash) external onlyAdmin {
        _transitionReceipt(receiptId, ReceiptStatus.REVOKED, evidenceHash);
    }

    function markCorrected(bytes32 receiptId, bytes32 evidenceHash) external onlyAdmin {
        _transitionReceipt(receiptId, ReceiptStatus.CORRECTED, evidenceHash);
    }

    function collectionExists(bytes32 assetClassId) external view returns (bool) {
        return _collections[assetClassId].tokenAddress != address(0);
    }

    function getCollection(bytes32 assetClassId) external view returns (Collection memory) {
        return _requireCollection(assetClassId);
    }

    function receiptExists(bytes32 receiptId) external view returns (bool) {
        return _receipts[receiptId].status != ReceiptStatus.NONE;
    }

    function getReceipt(bytes32 receiptId) external view returns (Receipt memory) {
        return _requireReceipt(receiptId);
    }

    function verifyReceipt(bytes32 receiptId) external view returns (Receipt memory) {
        return _requireReceipt(receiptId);
    }

    /// @notice Returns the sole direct replacement for a corrected receipt, if issued.
    function getReplacementReceiptId(bytes32 correctedReceiptId) external view returns (bytes32) {
        Receipt storage original = _requireReceipt(correctedReceiptId);
        if (original.status != ReceiptStatus.CORRECTED) revert InvalidReplacement(correctedReceiptId);
        return _replacementReceiptIds[correctedReceiptId];
    }

    function _changeCollectionStatus(bytes32 assetClassId, CollectionStatus requested) private {
        Collection storage collection = _requireCollection(assetClassId);
        CollectionStatus previous = collection.status;
        bool allowed = (
            previous == CollectionStatus.ACTIVE
                && (requested == CollectionStatus.SUSPENDED || requested == CollectionStatus.RETIRED)
        )
            || (
                previous == CollectionStatus.SUSPENDED
                    && (requested == CollectionStatus.ACTIVE || requested == CollectionStatus.RETIRED)
            );
        if (!allowed) revert InvalidCollectionTransition(previous, requested);
        collection.status = requested;
        emit CollectionStatusChanged(assetClassId, previous, requested, msg.sender);
    }

    function _transitionReceipt(bytes32 receiptId, ReceiptStatus requested, bytes32 evidenceHash) private {
        Receipt storage receipt = _requireReceipt(receiptId);
        if (receipt.status != ReceiptStatus.ISSUED && receipt.status != ReceiptStatus.MATURED) {
            revert InvalidReceiptStatus(receiptId, receipt.status, requested);
        }
        _setReceiptStatus(receipt, requested, evidenceHash);
    }

    function _setReceiptStatus(Receipt storage receipt, ReceiptStatus requested, bytes32 evidenceHash) private {
        if (evidenceHash == bytes32(0)) revert MissingStatusEvidence();
        ReceiptStatus previous = receipt.status;
        receipt.status = requested;
        receipt.statusEvidenceHash = evidenceHash;
        receipt.statusChangedAt = uint64(block.timestamp);
        emit ReceiptStatusChanged(
            receipt.receiptId, previous, requested, evidenceHash, receipt.statusChangedAt, msg.sender
        );
    }

    function _validateReplacement(bytes32 replacesReceiptId, address recipient) private view {
        if (replacesReceiptId == bytes32(0)) return;
        Receipt storage original = _requireReceipt(replacesReceiptId);
        if (original.status != ReceiptStatus.CORRECTED) revert InvalidReplacement(replacesReceiptId);
        if (original.owner != recipient) revert ReplacementOwnerMismatch(original.owner, recipient);
        bytes32 existingReplacement = _replacementReceiptIds[replacesReceiptId];
        if (existingReplacement != bytes32(0)) {
            revert ReplacementAlreadyIssued(replacesReceiptId, existingReplacement);
        }
    }

    function _validateIssueInput(
        bytes32 receiptId,
        bytes32 instrumentRefHash,
        address recipient,
        bytes3 currency,
        uint64 purchaseAmountMinor,
        uint64 faceValueMinor,
        uint64 effectiveDate,
        uint64 maturityDate,
        bytes32 termsDocumentHash,
        string calldata hip412MetadataUri
    ) private pure {
        _requireNonZero(receiptId);
        _requireNonZero(instrumentRefHash);
        _requireNonZero(termsDocumentHash);
        if (recipient == address(0)) revert ZeroAddress();
        if (currency == bytes3(0)) revert InvalidCurrency();
        if (purchaseAmountMinor == 0 || faceValueMinor == 0) revert InvalidAmounts();
        if (effectiveDate == 0 || maturityDate <= effectiveDate) revert InvalidDates();
        _validateMetadataUri(hip412MetadataUri);
    }

    function _validateMetadataUri(string calldata uri) private pure {
        bytes calldata raw = bytes(uri);
        if (raw.length > MAX_HTS_NFT_METADATA_BYTES || raw.length < 8) revert InvalidMetadataUri();
        if (
            raw[0] != "i" || raw[1] != "p" || raw[2] != "f" || raw[3] != "s" || raw[4] != ":" || raw[5] != "/"
                || raw[6] != "/"
        ) revert InvalidMetadataUri();
    }

    function _requireActiveCollection(bytes32 assetClassId) private view returns (Collection storage collection) {
        collection = _requireCollection(assetClassId);
        if (collection.status != CollectionStatus.ACTIVE) revert CollectionNotActive(assetClassId, collection.status);
    }

    function _requireCollection(bytes32 assetClassId) private view returns (Collection storage collection) {
        collection = _collections[assetClassId];
        if (collection.tokenAddress == address(0)) revert CollectionNotFound(assetClassId);
    }

    function _requireReceipt(bytes32 receiptId) private view returns (Receipt storage receipt) {
        receipt = _receipts[receiptId];
        if (receipt.status == ReceiptStatus.NONE) revert ReceiptNotFound(receiptId);
    }

    function _buildTokenKeys() private view returns (IHederaTokenService.TokenKey[] memory keys) {
        keys = new IHederaTokenService.TokenKey[](2);
        keys[0] = _contractKey(KEY_TYPE_SUPPLY);
        keys[1] = _contractKey(KEY_TYPE_FREEZE);
    }

    function _contractKey(uint256 keyType) private view returns (IHederaTokenService.TokenKey memory tokenKey) {
        tokenKey.keyType = keyType;
        tokenKey.key.contractId = address(this);
    }

    function _requireHtsSuccess(bytes32 operation, int64 responseCode) private pure {
        if (responseCode != HTS_SUCCESS) revert HtsOperationFailed(operation, responseCode);
    }

    function _requireNonZero(bytes32 value) private pure {
        if (value == bytes32(0)) revert EmptyBytes32();
    }

    function _validateText(string calldata value) private pure {
        bytes calldata raw = bytes(value);
        if (raw.length == 0 || raw.length > 100) revert InvalidText();
        for (uint256 i; i < raw.length; ++i) {
            if (raw[i] == 0) revert InvalidText();
        }
    }
}
