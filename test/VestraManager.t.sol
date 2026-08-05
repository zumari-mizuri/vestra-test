// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {IHederaTokenService} from "../src/interfaces/IHederaTokenService.sol";
import {VestraManager} from "../src/VestraManager.sol";

contract MockHts is IHederaTokenService {
    int64 private constant SUCCESS = 22;
    int64 private constant TOKEN_NOT_ASSOCIATED = 184;
    address private constant TREASURY = address(0); // overwritten per collection

    uint160 private _nextToken = 1000;
    mapping(address => address) public treasuryOf;
    mapping(address => int64) public nextSerial;
    mapping(address => mapping(int64 => address)) public nftOwner;
    mapping(address => mapping(address => bool)) public associated;
    mapping(address => mapping(address => bool)) public frozen;

    function associate(address token, address account) external {
        associated[token][account] = true;
        frozen[token][account] = true;
    }

    function createNonFungibleToken(HederaToken memory token) external payable returns (int64, address tokenAddress) {
        tokenAddress = address(_nextToken++);
        treasuryOf[tokenAddress] = token.treasury;
        return (SUCCESS, tokenAddress);
    }

    function mintToken(address token, int64, bytes[] memory metadata)
        external
        returns (int64, int64, int64[] memory serialNumbers)
    {
        require(metadata.length == 1, "metadata");
        int64 serial = ++nextSerial[token];
        nftOwner[token][serial] = treasuryOf[token];
        serialNumbers = new int64[](1);
        serialNumbers[0] = serial;
        return (SUCCESS, serial, serialNumbers);
    }

    function transferNFT(address token, address sender, address recipient, int64 serialNumber)
        external
        returns (int64)
    {
        if (!associated[token][recipient]) return TOKEN_NOT_ASSOCIATED;
        require(nftOwner[token][serialNumber] == sender, "owner");
        require(!frozen[token][sender] && !frozen[token][recipient], "frozen");
        nftOwner[token][serialNumber] = recipient;
        return SUCCESS;
    }

    function freezeToken(address token, address account) external returns (int64) {
        frozen[token][account] = true;
        return SUCCESS;
    }

    function unfreezeToken(address token, address account) external returns (int64) {
        frozen[token][account] = false;
        return SUCCESS;
    }
}

contract VestraManagerTest {
    bytes32 private constant ASSET_CLASS = keccak256("NIGERIAN_TBILL");
    bytes32 private constant RECEIPT_ONE = keccak256("receipt-1");
    bytes32 private constant TERMS_HASH = keccak256("terms-1");
    bytes32 private constant INSTRUMENT_HASH = keccak256("instrument-1");
    address private constant INVESTOR = address(0xBEEF);
    string private constant URI = "ipfs://bafybeigdyrzt5-example/receipt-1.json";

    MockHts private hts;
    VestraManager private manager;
    address private token;

    function setUp() public {
        hts = new MockHts();
        manager = new VestraManager(address(hts));
        token = manager.createCollection(ASSET_CLASS, "Nigerian Treasury Bills", "VTB");
        hts.associate(token, INVESTOR);
    }

    function testIssueReceiptStoresTermsAndFreezesInvestor() public {
        int64 serial = _issue(RECEIPT_ONE, bytes32(0), INVESTOR);
        VestraManager.Receipt memory receipt = manager.getReceipt(RECEIPT_ONE);
        require(serial == 1, "serial");
        require(receipt.status == VestraManager.ReceiptStatus.ISSUED, "status");
        require(receipt.owner == INVESTOR, "investor");
        require(receipt.purchaseAmountMinor == 200_000_000, "amount");
        require(receipt.metadataUriHash == keccak256(bytes(URI)), "uri hash");
        require(hts.nftOwner(token, serial) == INVESTOR, "native owner");
        require(hts.frozen(token, INVESTOR), "must freeze");
    }

    function testRejectsUnassociatedRecipientWithoutCreatingReceipt() public {
        bytes32 receiptId = keccak256("unassociated");
        address unassociated = address(0xCAFE);
        (bool ok,) = address(manager).call(_issueCall(receiptId, bytes32(0), unassociated));
        require(!ok, "must reject");
        require(!manager.receiptExists(receiptId), "must roll back");
    }

    function testLifecycleAndTerminalState() public {
        _issue(RECEIPT_ONE, bytes32(0), INVESTOR);
        manager.markMatured(RECEIPT_ONE, keccak256("maturity"));
        manager.markRedeemed(RECEIPT_ONE, keccak256("settlement"));
        VestraManager.Receipt memory receipt = manager.getReceipt(RECEIPT_ONE);
        require(receipt.status == VestraManager.ReceiptStatus.REDEEMED, "redeemed");
        (bool ok,) = address(manager).call(abi.encodeCall(manager.markRevoked, (RECEIPT_ONE, keccak256("late"))));
        require(!ok, "terminal");
    }

    function testCorrectionRequiresReplacementForSameWallet() public {
        _issue(RECEIPT_ONE, bytes32(0), INVESTOR);
        manager.markCorrected(RECEIPT_ONE, keccak256("correction"));
        bytes32 replacementId = keccak256("replacement");
        _issue(replacementId, RECEIPT_ONE, INVESTOR);
        require(manager.getReceipt(replacementId).replacesReceiptId == RECEIPT_ONE, "link");
        require(manager.getReplacementReceiptId(RECEIPT_ONE) == replacementId, "replacement lookup");

        bytes32 duplicateReplacement = keccak256("duplicate-replacement");
        (bool duplicateOk,) = address(manager).call(_issueCall(duplicateReplacement, RECEIPT_ONE, INVESTOR));
        require(!duplicateOk, "one direct replacement only");

        bytes32 badReplacement = keccak256("bad-replacement");
        hts.associate(token, address(0x1234));
        (bool ok,) = address(manager).call(_issueCall(badReplacement, RECEIPT_ONE, address(0x1234)));
        require(!ok, "wallet migration forbidden");
    }

    function testCorrectedReplacementCanHaveOneReplacement() public {
        _issue(RECEIPT_ONE, bytes32(0), INVESTOR);
        manager.markCorrected(RECEIPT_ONE, keccak256("first correction"));
        bytes32 second = keccak256("second");
        _issue(second, RECEIPT_ONE, INVESTOR);
        manager.markCorrected(second, keccak256("second correction"));
        bytes32 third = keccak256("third");
        _issue(third, second, INVESTOR);
        require(manager.getReplacementReceiptId(second) == third, "linear chain");
    }

    function testRetiredCollectionCannotIssueOrResume() public {
        manager.retireCollection(ASSET_CLASS);
        (bool issueOk,) = address(manager).call(_issueCall(RECEIPT_ONE, bytes32(0), INVESTOR));
        require(!issueOk, "issue retired");
        (bool resumeOk,) = address(manager).call(abi.encodeCall(manager.resumeCollection, (ASSET_CLASS)));
        require(!resumeOk, "resume retired");
    }

    function testRejectsNonIpfsMetadataUri() public {
        (bool ok,) = address(manager).call(
            abi.encodeCall(
                manager.issueReceipt,
                (
                    ASSET_CLASS,
                    RECEIPT_ONE,
                    INSTRUMENT_HASH,
                    INVESTOR,
                    bytes3("NGN"),
                    uint64(1),
                    uint64(1),
                    uint64(0),
                    uint32(0),
                    uint64(1),
                    uint64(2),
                    TERMS_HASH,
                    bytes32(0),
                    "https://example.com/receipt.json"
                )
            )
        );
        require(!ok, "must reject");
    }

    function _issue(bytes32 receiptId, bytes32 replacesReceiptId, address recipient) private returns (int64) {
        return manager.issueReceipt(
            ASSET_CLASS,
            receiptId,
            INSTRUMENT_HASH,
            recipient,
            bytes3("NGN"),
            200_000_000,
            200_000_000,
            33_126_319,
            1700,
            1_742_342_400,
            1_773_878_400,
            TERMS_HASH,
            replacesReceiptId,
            URI
        );
    }

    function _issueCall(bytes32 receiptId, bytes32 replacesReceiptId, address recipient)
        private
        pure
        returns (bytes memory)
    {
        return abi.encodeWithSelector(
            VestraManager.issueReceipt.selector,
            ASSET_CLASS,
            receiptId,
            INSTRUMENT_HASH,
            recipient,
            bytes3("NGN"),
            uint64(200_000_000),
            uint64(200_000_000),
            uint64(33_126_319),
            uint32(1700),
            uint64(1_742_342_400),
            uint64(1_773_878_400),
            TERMS_HASH,
            replacesReceiptId,
            URI
        );
    }
}
