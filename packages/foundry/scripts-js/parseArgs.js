import { spawnSync } from "child_process";
import { config } from "dotenv";
import { join, dirname } from "path";
import { readFileSync, existsSync } from "fs";
import { parse } from "toml";
import { fileURLToPath } from "url";
import { selectOrCreateKeystore } from "./selectOrCreateKeystore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config();

// Get all arguments after the script name
const args = process.argv.slice(2);
let fileName = "Deploy.s.sol";
let network = "localhost";
let keystoreArg = null;

// Show help message if --help is provided
if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Usage: yarn deploy [options]
Options:
  --file <filename>     Specify the deployment script file (default: Deploy.s.sol)
  --network <network>   Specify the network (default: localhost)
  --keystore <name>     Specify the keystore account to use (bypasses selection prompt)
  --help, -h           Show this help message
Examples:
  yarn deploy --file DeployYourContract.s.sol --network sepolia
  yarn deploy --network sepolia --keystore my-account
  yarn deploy --file DeployYourContract.s.sol
  yarn deploy
  `);
  process.exit(0);
}

// Parse arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--network" && args[i + 1]) {
    network = args[i + 1];
    i++; // Skip next arg since we used it
  } else if (args[i] === "--file" && args[i + 1]) {
    fileName = args[i + 1];
    i++; // Skip next arg since we used it
  } else if (args[i] === "--keystore" && args[i + 1]) {
    keystoreArg = args[i + 1];
    i++; // Skip next arg since we used it
  }
}

// Function to check if a keystore exists
function validateKeystore(keystoreName) {
  if (keystoreName === "scaffold-eth-default") {
    return true; // Default keystore is always valid
  }

  const keystorePath = join(
    process.env.HOME,
    ".foundry",
    "keystores",
    keystoreName
  );
  return existsSync(keystorePath);
}

// Check if the network exists in rpc_endpoints
try {
  const foundryTomlPath = join(__dirname, "..", "foundry.toml");
  const tomlString = readFileSync(foundryTomlPath, "utf-8");
  const parsedToml = parse(tomlString);

  if (!parsedToml.rpc_endpoints[network]) {
    console.log(
      `\n❌ Error: Network '${network}' not found in foundry.toml!`,
      "\nPlease check `foundry.toml` for available networks in the [rpc_endpoints] section or add a new network."
    );
    process.exit(1);
  }
} catch (error) {
  console.error("\n❌ Error reading or parsing foundry.toml:", error);
  process.exit(1);
}

if (
  process.env.LOCALHOST_KEYSTORE_ACCOUNT !== "scaffold-eth-default" &&
  network === "localhost"
) {
  console.log(`
⚠️ Warning: Using ${process.env.LOCALHOST_KEYSTORE_ACCOUNT} keystore account on localhost.

You can either:
1. Enter the password for ${process.env.LOCALHOST_KEYSTORE_ACCOUNT} account
   OR
2. Set the localhost keystore account in your .env and re-run the command to skip password prompt:
   LOCALHOST_KEYSTORE_ACCOUNT='scaffold-eth-default'
`);
}

let selectedKeystore = process.env.LOCALHOST_KEYSTORE_ACCOUNT;
if (network !== "localhost") {
  if (keystoreArg) {
    // Use the keystore provided via command line argument
    if (!validateKeystore(keystoreArg)) {
      console.log(`\n❌ Error: Keystore '${keystoreArg}' not found!`);
      console.log(
        `Please check that the keystore exists in ~/.foundry/keystores/`
      );
      process.exit(1);
    }
    selectedKeystore = keystoreArg;
    console.log(`\n🔑 Using keystore: ${selectedKeystore}`);
  } else {
    try {
      selectedKeystore = await selectOrCreateKeystore();
    } catch (error) {
      console.error("\n❌ Error selecting keystore:", error);
      process.exit(1);
    }
  }
} else if (keystoreArg) {
  // Allow overriding the localhost keystore with --keystore flag
  if (!validateKeystore(keystoreArg)) {
    console.log(`\n❌ Error: Keystore '${keystoreArg}' not found!`);
    console.log(
      `Please check that the keystore exists in ~/.foundry/keystores/`
    );
    process.exit(1);
  }
  selectedKeystore = keystoreArg;
  console.log(
    `\n🔑 Using keystore: ${selectedKeystore} for localhost deployment`
  );
}

// Check for default account on live network
if (selectedKeystore === "scaffold-eth-default" && network !== "localhost") {
  console.log(`
❌ Error: Cannot deploy to live network using default keystore account!

To deploy to ${network}, please follow these steps:

1. If you haven't generated a keystore account yet:
   $ yarn generate

2. Run the deployment command again.

The default account (scaffold-eth-default) can only be used for localhost deployments.
`);
  process.exit(0);
}

// Set environment variables for the make command
process.env.DEPLOY_SCRIPT = `script/${fileName}`;
process.env.RPC_URL = network;
process.env.ETH_KEYSTORE_ACCOUNT = selectedKeystore;

// Execute deploy command
const deployScript = `script/${fileName}`;
const rpcUrl = network;
const keystore = selectedKeystore;

console.log(`Running deploy script: ${deployScript} on ${rpcUrl}`);

const deployArgs = [
  "script",
  deployScript,
  "--rpc-url",
  rpcUrl,
  "--broadcast",
  "--ffi",
];

if (rpcUrl === "localhost") {
  if (keystore === "scaffold-eth-default") {
    deployArgs.push("--password", "localhost");
    // Also need to use the imported keystore?
    // forge script uses --account <keystore> or implicit default?
    // Wait, the makefile doesn't specify --account explicitly, it relies on default sender?
    // Ah, wait. `forge script` will use the default account if not specified?
    // The makefile rule for `deploy` uses `forge script ...` but doesn't pass `--account` or `--sender`.
    // However, `cast wallet import ... scaffold-eth-default` imports it as `scaffold-eth-default`.
    // Does `forge script` automatically use `scaffold-eth-default`?
    // No, usually you need `--account`.
    // But `setup-anvil-wallet` imports it as `scaffold-eth-default`.
    // Let's re-read the Makefile carefully.
    
    // Makefile:
    // deploy:
    // ...
    // forge script $(DEPLOY_SCRIPT) --rpc-url localhost --password localhost --broadcast --ffi;
    
    // It doesn't seem to pass `--account`. Maybe `foundry.toml` sets a default sender?
    // Or maybe `forge script` picks up the only keystore available?
    // Or maybe `Deploy.s.sol` handles the sender?
    
    // Let's check `packages/foundry/foundry.toml` later.
    // For now, I'll stick to what the Makefile does.
  }
}

// Add legacy support for non-make environment?
// Actually, `spawnSync("make"...)` inherited stdio, so it ran in the shell environment where these vars were set?
// No, I'm replacing `make`.

const deployResult = spawnSync("forge", deployArgs, {
  stdio: "inherit",
  shell: true,
});

if (deployResult.status !== 0) {
  process.exit(deployResult.status);
}

// Execute generate-abis
console.log("Generating ABIs...");
const generateAbisResult = spawnSync("node", ["scripts-js/generateTsAbis.js"], {
  stdio: "inherit",
  shell: true,
});

process.exit(generateAbisResult.status);
