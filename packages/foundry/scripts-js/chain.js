import { spawnSync } from "child_process";
import { join } from "path";
import { homedir } from "os";

const runCommand = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit", shell: true });
  if (result.error) {
    console.error(`Error executing ${command}:`, result.error);
    process.exit(1);
  }
};

const home = homedir();
const keystorePath = join(home, ".foundry", "keystores", "scaffold-eth-default");

// Remove existing keystore (ignore errors)
try {
  spawnSync("shx", ["rm", keystorePath], { stdio: "ignore", shell: true });
} catch (e) {}

// Remove broadcast artifacts
try {
  spawnSync("shx", ["rm", "-rf", "broadcast/Deploy.s.sol/31337"], { stdio: "inherit", shell: true });
} catch (e) {}

// Import wallet
console.log("Importing default wallet...");
runCommand("cast", [
  "wallet",
  "import",
  "--private-key",
  "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
  "--unsafe-password",
  "localhost",
  "scaffold-eth-default"
]);

// Start anvil
console.log("Starting Anvil...");
runCommand("anvil", []);
