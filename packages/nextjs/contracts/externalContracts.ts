import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

const externalContracts = {
  84532: {
    // Base Sepolia
    DarkToken: {
      address: "0x0000000000000000000000000000000000000000",
      abi: [],
    },
  },
} as const satisfies GenericContractsDeclaration;

export default externalContracts;
