// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Paylock} from "../src/Paylock.sol";

contract DeployPaylock is Script {
    function run() external {
        vm.startBroadcast();
        Paylock deployed = new Paylock();
        vm.stopBroadcast();
        console.log("Paylock", address(deployed));
    }
}
