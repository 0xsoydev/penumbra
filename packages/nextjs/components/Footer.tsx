import React from "react";
import { hardhat } from "viem/chains";
import { SwitchTheme } from "~~/components/SwitchTheme";
import { Faucet } from "~~/components/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";

/**
 * Site footer
 */
export const Footer = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;

  return (
    <footer className="w-full bg-[#F5F6F8] text-[#111111] py-8 px-4 font-sans mt-auto border-t border-[#111111]/10">
      <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-bold tracking-widest">
        {/* Left Side - Simple Text */}
        <div className="flex items-center gap-4">
          <span>© {new Date().getFullYear()} DA SH COMPANY.</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#4b35f7]"></span>
          <span>ALL RIGHTS RESERVED.</span>
        </div>

        {/* Right Side - Tools */}
        <div className="flex items-center gap-6">
          {/* Local network utilities */}
          {isLocalNetwork && (
            <div className="flex items-center gap-2">
              <Faucet />
            </div>
          )}
          <SwitchTheme className={`pointer-events-auto ${isLocalNetwork ? "self-end md:self-auto" : ""}`} />
        </div>
      </div>
    </footer>
  );
};
