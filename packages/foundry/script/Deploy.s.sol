//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import {DeployPenumbraToken} from "./DeployPenumbraToken.s.sol";
import {DeployPenumbraAuction} from "./DeployPenumbraAuction.s.sol";

contract DeployScript is ScaffoldETHDeploy {
    function run() external {
        DeployPenumbraToken deployToken = new DeployPenumbraToken();
        deployToken.run();

        DeployPenumbraAuction deployAuction = new DeployPenumbraAuction();
        deployAuction.run();
    }
}
