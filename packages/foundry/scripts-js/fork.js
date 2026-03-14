import { spawnSync } from "child_process";
import { homedir } from "os";
import { join } from "path";

// Setup wallet same as chain
const home = homedir();
const keystorePath = join(home, ".foundry", "keystores", "scaffold-eth-default");
try {
  spawnSync("shx", ["rm", keystorePath], { stdio: "ignore", shell: true });
} catch (e) {}

try {
  spawnSync("shx", ["rm", "-rf", "broadcast/Deploy.s.sol/31337"], { stdio: "inherit", shell: true });
} catch (e) {}

console.log("Importing default wallet...");
spawnSync("cast", [
  "wallet",
  "import",
  "--private-key", "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
  "--unsafe-password", "localhost",
  "scaffold-eth-default"
], { stdio: "inherit", shell: true });

// Determine Fork URL
// Arguments: node scripts-js/fork.js [fork_url]
const forkUrl = process.argv[2] || "mainnet";

console.log(`Forking ${forkUrl}...`);
spawnSync("anvil", ["--fork-url", forkUrl, "--chain-id", "31337"], { stdio: "inherit", shell: true });
