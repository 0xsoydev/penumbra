"use client";

import Image from "next/image";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import safeBoxImage from "~~/components/assets/safe-box.png";
import starImage from "~~/components/assets/star.png";

export const Hero = () => {
  return (
    <div className="bg-[#0066FF] w-full p-4 md:p-8 lg:p-12 flex flex-col items-center min-h-screen">
      {/* Inner Rounded Box */}
      <div
        className="w-full flex-1 bg-[#E5E5E5] rounded-[40px] md:rounded-[60px] relative overflow-hidden flex flex-col"
        style={{
          backgroundImage: `
               linear-gradient(to right, #A0C4FF 1px, transparent 1px),
               linear-gradient(to bottom, #A0C4FF 1px, transparent 1px)
             `,
          backgroundSize: "100px 100px",
          backgroundPosition: "0 0",
        }}
      >
        {/* Floating Tiles Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div
            className="absolute bg-[#E5E5E5] border border-[#A0C4FF]"
            style={{ top: "100px", left: "20%", width: "100px", height: "100px" }}
          />
          <div
            className="absolute bg-[#E5E5E5] border border-[#A0C4FF]"
            style={{ top: "400px", left: "10%", width: "100px", height: "100px" }}
          />
          <div
            className="absolute bg-[#E5E5E5] border border-[#A0C4FF]"
            style={{ top: "200px", right: "15%", width: "100px", height: "100px" }}
          />
          <div
            className="absolute bg-[#E5E5E5] border border-[#A0C4FF]"
            style={{ top: "300px", right: "25%", width: "100px", height: "100px" }}
          />
          <div
            className="absolute bg-[#E5E5E5] border border-[#A0C4FF]"
            style={{ top: "300px", right: "15%", width: "100px", height: "100px" }}
          />
        </div>

        {/* Navbar */}
        <div className="w-full h-[100px] flex items-center justify-between px-6 md:px-12 lg:px-24 relative z-30">
          <div className="font-winky font-normal text-2xl md:text-3xl tracking-[0.15em] text-black">PENUMBRA</div>
          <div className="hidden md:flex gap-8 lg:gap-12 text-sm font-medium text-black font-dm">
            <Link href="/" className="cursor-pointer hover:text-[#0066FF] transition-colors">
              Home
            </Link>
            <Link href="/about" className="cursor-pointer hover:text-[#0066FF] transition-colors">
              About Us
            </Link>
            <Link href="/profile" className="cursor-pointer hover:text-[#0066FF] transition-colors">
              Dashboard
            </Link>
            <Link href="/auctions" className="cursor-pointer hover:text-[#0066FF] transition-colors">
              Auctions
            </Link>
          </div>
          <div className="flex items-center">
            <ConnectButton.Custom>
              {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
                const connected = mounted && account && chain;
                return (
                  <div
                    {...(!mounted && {
                      "aria-hidden": true,
                      style: { opacity: 0, pointerEvents: "none" as const, userSelect: "none" as const },
                    })}
                  >
                    {!connected ? (
                      <button
                        onClick={openConnectModal}
                        className="font-dm px-4 py-2 md:px-6 md:py-2.5 border border-black text-black font-bold text-xs md:text-sm bg-[#E5E5E5] shadow-[3px_3px_0px_#0066FF] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-[2px_2px_0px_#0066FF] transition-all whitespace-nowrap"
                      >
                        Connect Wallet
                      </button>
                    ) : chain?.unsupported ? (
                      <button
                        onClick={openChainModal}
                        className="font-dm px-4 py-2 md:px-6 md:py-2.5 border border-black text-red-500 font-bold text-xs md:text-sm bg-[#E5E5E5] shadow-[3px_3px_0px_#ff0000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-[2px_2px_0px_#ff0000] transition-all whitespace-nowrap"
                      >
                        Wrong Network
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 font-dm">
                        <button
                          onClick={openChainModal}
                          className="px-3 py-2 border border-black text-black font-bold text-xs md:text-sm bg-[#E5E5E5] shadow-[3px_3px_0px_#0066FF] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-[2px_2px_0px_#0066FF] transition-all whitespace-nowrap hidden sm:flex items-center gap-2"
                        >
                          {chain?.hasIcon && chain.iconUrl && (
                            <img alt={chain.name ?? "Chain"} src={chain.iconUrl} className="w-4 h-4 rounded-full" />
                          )}
                          <span>{chain?.name}</span>
                        </button>
                        <button
                          onClick={openAccountModal}
                          className="px-4 py-2 md:px-6 md:py-2.5 border border-black text-black font-bold text-xs md:text-sm bg-[#E5E5E5] shadow-[3px_3px_0px_#0066FF] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-[2px_2px_0px_#0066FF] transition-all whitespace-nowrap"
                        >
                          {account.displayName}
                        </button>
                      </div>
                    )}
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </div>

        {/* Hero Section Content */}
        <div className="relative flex-1 w-full flex flex-col lg:flex-row items-center justify-between px-6 md:px-12 lg:px-24 z-20 pb-20 gap-12">
          {/* Left Column - Text */}
          <div className="w-full lg:w-1/2 max-w-5xl">
            <h1 className="font-winky text-[clamp(3rem,8vw,100px)] font-normal text-black leading-[1.2] tracking-wide flex flex-col">
              <span className="flex items-center flex-wrap gap-x-4 md:gap-x-6 gap-y-4">
                <span>Start a</span>
                <span className="relative inline-block pointer-events-auto">
                  <span
                    className="font-fira font-bold relative z-10 text-black px-4 md:px-8 py-2 md:py-4 bg-[#2ea3fe] inline-block transform -rotate-2"
                    style={{
                      maskImage: "radial-gradient(circle 24px at top right, transparent 24px, black 25px)",
                      WebkitMaskImage: "radial-gradient(circle 24px at top right, transparent 24px, black 25px)",
                    }}
                  >
                    Private
                  </span>
                  {/* Star Image */}
                  <div className="absolute -top-6 -right-6 md:-top-8 md:-right-8 w-12 h-12 md:w-16 md:h-16 z-20">
                    <Image src={starImage} alt="Star" layout="fill" objectFit="contain" />
                  </div>
                </span>
              </span>
              <span className="mt-2 md:mt-4">OTC Auction</span>
            </h1>

            {/* Action Buttons */}
            <div className="mt-12 flex flex-wrap gap-4 md:gap-6 pointer-events-auto">
              <Link
                href="/auctions"
                className="font-dm btn bg-black text-white hover:bg-gray-800 border-none rounded-none px-8 md:px-10 py-3 md:py-4 h-auto text-base md:text-xl font-bold shadow-[6px_6px_0px_#0066FF] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[4px_4px_0px_#0066FF] transition-all tracking-wide"
              >
                Browse Auctions
              </Link>
              <Link
                href="/auction/create"
                className="font-dm btn bg-[#E5E5E5] text-black border-2 border-black hover:bg-black hover:text-white rounded-none px-8 md:px-10 py-3 md:py-4 h-auto text-base md:text-xl font-bold shadow-[6px_6px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-all tracking-wide"
              >
                Create Auction
              </Link>
            </div>
          </div>

          {/* Right Column - Image */}
          <div className="w-full lg:w-1/2 flex justify-center lg:justify-end pointer-events-none mt-12 lg:mt-0 lg:translate-x-22">
            <div className="relative w-full max-w-[600px] aspect-square transform scale-125 lg:scale-150 origin-center lg:origin-right">
              <Image src={safeBoxImage} alt="Safe Box with Crypto" layout="fill" objectFit="contain" priority />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
