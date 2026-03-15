"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Us" },
  { href: "/profile", label: "Dashboard" },
  { href: "/auctions", label: "Auctions" },
] as const;

export const Navbar = () => {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = useCallback(
    (href: string) => {
      if (href === "/") return pathname === "/";
      if (href.startsWith("/#")) return false;
      return pathname.startsWith(href);
    },
    [pathname],
  );

  // Hide default navbar on home page to use custom hero navbar
  if (pathname === "/") return null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-black bg-[#E5E5E5]">
      <div className="w-full h-[100px] flex items-center justify-between px-6 md:px-12 lg:px-24">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="font-winky font-normal text-2xl md:text-3xl text-black">penumbra</div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex gap-8 lg:gap-12 text-sm font-medium text-black font-dm">
          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`cursor-pointer transition-colors ${
                isActive(link.href) ? "text-[#0066FF]" : "hover:text-[#0066FF]"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Wallet + mobile toggle */}
        <div className="flex items-center gap-4">
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

          {/* Mobile hamburger */}
          <button
            className="md:hidden border border-black p-2 bg-[#E5E5E5] shadow-[2px_2px_0px_#0066FF]"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5 text-black"
            >
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <nav className="md:hidden border-t border-black bg-[#E5E5E5] flex flex-col font-dm">
          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={`px-6 py-4 border-b border-black text-sm font-medium transition-colors ${
                isActive(link.href) ? "bg-[#0066FF] text-white" : "text-black hover:bg-[#d5d5d5]"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
};
