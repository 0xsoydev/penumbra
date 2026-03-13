// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import "../contracts/PenumbraAuction.sol";

contract DeployPenumbraAuction is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        PenumbraAuction auction = new PenumbraAuction(deployer);
        console.log("PenumbraAuction deployed at:", address(auction));
        deployments.push(Deployment("PenumbraAuction", address(auction)));
    }
}
