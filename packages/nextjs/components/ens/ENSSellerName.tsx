"use client";

import { useEnsName, useEnsText } from "wagmi";
import { normalize } from "viem/ens";
import { Address } from "@scaffold-ui/components";
import { SellerReputation } from "~~/components/ens/SellerReputation";

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
    <div className="flex flex-col gap-1">
      {/* ── Original identity row — unchanged ── */}
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

      {/* ── Verified reputation card — renders nothing if no manifest set ── */}
      <SellerReputation sellerAddress={sellerAddress} />
    </div>
  );
}
