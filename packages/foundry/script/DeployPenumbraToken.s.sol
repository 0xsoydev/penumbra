// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import "../contracts/PenumbraToken.sol";

contract DeployPenumbraToken is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        PenumbraToken token = new PenumbraToken(deployer);
        console.log("PenumbraToken deployed at:", address(token));
        deployments.push(Deployment("PenumbraToken", address(token)));
    }
}
