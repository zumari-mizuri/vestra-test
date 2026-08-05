// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {VestraManager} from "../src/VestraManager.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

/// @notice Deploys VestraManager against the Hedera HTS precompile.
contract DeployVestraManager {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant HTS_PRECOMPILE = address(0x167);

    function run() external returns (VestraManager manager) {
        VM.startBroadcast();
        manager = new VestraManager(HTS_PRECOMPILE);
        VM.stopBroadcast();
    }
}
