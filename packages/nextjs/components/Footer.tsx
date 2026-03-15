import React from "react";

export const Footer = () => {
  return (
    <footer className="w-full bg-[#002BFF] text-white relative min-h-screen flex flex-col font-sans overflow-hidden">
      {/* Light Top Section */}
      <div className="bg-[#FFFFFF] text-[#002BFF] w-full pt-6 pb-[120px] relative border-b-0 border-transparent">
        {/* Ruler Ticks */}
        <div
          className="absolute top-0 left-0 w-full h-[30px] opacity-20"
          style={{
            backgroundImage: `
              repeating-linear-gradient(to right, transparent, transparent 9px, #002BFF 9px, #002BFF 10px),
              repeating-linear-gradient(to right, transparent, transparent 49px, #002BFF 49px, #002BFF 50px)
            `,
            backgroundSize: "10px 10px, 50px 20px",
            backgroundPosition: "0 0, 0 0",
            backgroundRepeat: "repeat-x",
          }}
        />

        {/* Crosshairs */}
        <div className="flex justify-between w-full px-[10%] pt-[40px] pb-[80px]">
          <div className="relative w-8 h-8 flex items-center justify-center">
            <div className="absolute w-[2px] h-full bg-[#002BFF]" />
            <div className="absolute w-full h-[2px] bg-[#002BFF]" />
            <div className="absolute w-[8px] h-[8px] bg-[#FFFFFF]" />
          </div>
          <div className="relative w-8 h-8 flex items-center justify-center">
            <div className="absolute w-[2px] h-full bg-[#002BFF]" />
            <div className="absolute w-full h-[2px] bg-[#002BFF]" />
            <div className="absolute w-[8px] h-[8px] bg-[#FFFFFF]" />
          </div>
          <div className="relative w-8 h-8 flex items-center justify-center">
            <div className="absolute w-[2px] h-full bg-[#002BFF]" />
            <div className="absolute w-full h-[2px] bg-[#002BFF]" />
            <div className="absolute w-[8px] h-[8px] bg-[#FFFFFF]" />
          </div>
        </div>

        {/* Pixel Transition Layer */}
        <div className="absolute bottom-0 left-0 w-full h-[160px] z-10">
          <svg className="w-full h-full" preserveAspectRatio="none">
            <pattern id="pixels" x="0" y="0" width="320" height="160" patternUnits="userSpaceOnUse">
              <g fill="#002BFF">
                {/* Upper scattered drops */}
                <rect x="0" y="60" width="20" height="20" />
                <rect x="40" y="80" width="20" height="20" />
                <rect x="80" y="40" width="20" height="20" />
                <rect x="120" y="80" width="20" height="20" />
                <rect x="180" y="60" width="20" height="20" />
                <rect x="220" y="40" width="20" height="20" />
                <rect x="260" y="80" width="20" height="20" />
                <rect x="300" y="60" width="20" height="20" />

                {/* Main blocky mountain shape */}
                <rect x="0" y="100" width="20" height="60" />
                <rect x="20" y="80" width="20" height="80" />
                <rect x="40" y="120" width="20" height="40" />
                <rect x="60" y="100" width="20" height="60" />
                <rect x="80" y="80" width="20" height="80" />
                <rect x="100" y="120" width="20" height="40" />
                <rect x="120" y="100" width="20" height="60" />
                <rect x="140" y="120" width="20" height="40" />
                <rect x="160" y="80" width="20" height="80" />
                <rect x="180" y="100" width="20" height="60" />
                <rect x="200" y="120" width="20" height="40" />
                <rect x="220" y="80" width="20" height="80" />
                <rect x="240" y="100" width="20" height="60" />
                <rect x="260" y="120" width="20" height="40" />
                <rect x="280" y="100" width="20" height="60" />
                <rect x="300" y="80" width="20" height="80" />

                {/* Fills */}
                <rect x="0" y="140" width="320" height="20" fill="#002BFF" />
              </g>
            </pattern>
            <rect width="100%" height="100%" fill="url(#pixels)" />
          </svg>
        </div>
      </div>

      {/* Main Content Area in Blue Section */}
      <div className="bg-[#002BFF] w-full pt-[40px] pb-32 px-4 md:px-12 lg:px-24 font-dm relative z-20 flex-1">
        {/* Header Row */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center w-full mb-16">
          <div className="text-sm tracking-widest mb-4 md:mb-0">[ ZK ]</div>
          <h2 className="font-winky font-normal text-4xl md:text-6xl lg:text-7xl tracking-[0.2em] uppercase text-white scale-y-125 origin-left">
            Penumbra
          </h2>
          <div className="text-xs tracking-widest mt-4 md:mt-0 uppercase">Sealed-Bid Auctions</div>
        </div>

        {/* Content Rows */}
        <div className="flex flex-col gap-16 mt-24 max-w-6xl mx-auto pl-0 md:pl-32">
          {/* MISSION */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-12">
            <div className="text-sm tracking-[0.2em] font-medium pt-1">[ MISSION ]</div>
            <div className="col-span-1 md:col-span-2 text-sm leading-relaxed tracking-wide opacity-90">
              Penumbra brings absolute privacy to on-chain auctions. By leveraging Zero-Knowledge proofs and stealth
              addresses, we ensure bids remain completely hidden until settlement, preventing front-running and
              protecting trading strategies.
            </div>
          </div>

          {/* STACK */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-12 mt-8 md:mt-16 md:ml-32">
            <div className="text-sm tracking-[0.2em] font-medium pt-1">[ STACK ]</div>
            <div className="col-span-1 md:col-span-2 text-sm leading-relaxed tracking-wide opacity-90">
              Built with Noir for ultra-fast ZK-SNARKs (UltraHonk), Scaffold-ETH 2 for robust smart contract
              infrastructure, and a native stealth address system for ultimate buyer and seller anonymity.
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
