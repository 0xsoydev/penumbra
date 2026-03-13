import { spawnSync } from "child_process";

const args = process.argv.slice(2);
let network = "localhost";

for (let i = 0; i < args.length; i++) {
    if (args[i] === "--network" && args[i + 1]) {
        network = args[i + 1];
        i++;
    } else if (!args[i].startsWith("-")) {
        network = args[i];
    }
}

console.log(`Verifying on network: ${network}`);

const verifyArgs = [
    "script",
    "script/VerifyAll.s.sol",
    "--ffi",
    "--rpc-url",
    network
];

const result = spawnSync("forge", verifyArgs, { stdio: "inherit", shell: true });
process.exit(result.status);
