"use client";

import { useEnsName, useEnsText } from "wagmi";
import { normalize } from "viem/ens";
import { Address } from "@scaffold-ui/components";

type Props = {
  sellerAddress: `0x${string}`;
  auctionId: number;
};

export function ENSSellerName({ sellerAddress, auctionId }: Props) {
  const { data: ensName } = useEnsName({ address: sellerAddress, chainId: 1 });

  const { data: darkAuctionText } = useEnsText({
    name: ensName ? normalize(ensName) : undefined,
    key: `darkauction.${auctionId}`,
    chainId: 1,
  });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Address address={sellerAddress} />
      {ensName && (
        <span className="badge badge-ghost text-xs" title="ENS name">
          {ensName}
        </span>
      )}
      {darkAuctionText && (
        <span
          className="badge badge-secondary text-xs"
          title={`darkauction.${auctionId} text record`}
        >
          {darkAuctionText}
        </span>
      )}
    </div>
  );
}
