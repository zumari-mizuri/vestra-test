// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/// @notice Minimal HTS surface used by VestraManager.
/// @dev Kept separate from the manager so it can be replaced by the pinned
///      Hiero Solidity interface package when this project is packaged.
interface IHederaTokenService {
    struct Expiry {
        int64 second;
        address autoRenewAccount;
        int64 autoRenewPeriod;
    }

    struct KeyValue {
        bool inheritAccountKey;
        address contractId;
        bytes ed25519;
        bytes ECDSA_secp256k1;
        address delegatableContractId;
    }

    struct TokenKey {
        uint256 keyType;
        KeyValue key;
    }

    struct HederaToken {
        string name;
        string symbol;
        address treasury;
        string memo;
        bool tokenSupplyType;
        int64 maxSupply;
        bool freezeDefault;
        TokenKey[] tokenKeys;
        Expiry expiry;
    }

    function createNonFungibleToken(HederaToken memory token)
        external
        payable
        returns (int64 responseCode, address tokenAddress);

    function mintToken(address token, int64 amount, bytes[] memory metadata)
        external
        returns (int64 responseCode, int64 newTotalSupply, int64[] memory serialNumbers);

    function transferNFT(address token, address sender, address recipient, int64 serialNumber)
        external
        returns (int64 responseCode);

    function freezeToken(address token, address account) external returns (int64 responseCode);

    function unfreezeToken(address token, address account) external returns (int64 responseCode);
}
