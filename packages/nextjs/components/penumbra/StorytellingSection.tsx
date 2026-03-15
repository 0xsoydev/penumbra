"use client";

import { useRef } from "react";
import { MotionValue, motion, useScroll, useTransform } from "framer-motion";

const steps = [
  {
    tag: "[ 01 / THE PROBLEM ]",
    title: "Public Exposure",
    description:
      "Traditional public auctions expose your bids and trading strategies. Everyone sees exactly what you're doing, leaving you vulnerable to front-running.",
    icon: (
      <svg
        className="w-20 h-20 md:w-32 md:h-32 text-black"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    tag: "[ 02 / THE COMMITMENT ]",
    title: "Zero-Knowledge Bids",
    description:
      "Penumbra leverages stealth addresses and ZK-proofs. You submit a sealed bid that remains cryptographically hidden on-chain.",
    icon: (
      <svg
        className="w-20 h-20 md:w-32 md:h-32 text-black"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    tag: "[ 03 / THE REVEAL ]",
    title: "Trustless Settlement",
    description:
      "Once the auction concludes, bidders reveal their commitments. The smart contract autonomously settles the auction in a provably fair manner.",
    icon: (
      <svg
        className="w-20 h-20 md:w-32 md:h-32 text-black"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
// Scroll math explained:
//
// Container: 500vh tall.  Offset: ["start end", "end end"]
//   → scrollYProgress = 0   when container TOP reaches viewport BOTTOM
//   → scrollYProgress = 1   when container BOTTOM reaches viewport BOTTOM
//   → Total tracked distance = 500vh
//   → 1 viewport-height of scroll = 100/500 = 0.20 of progress
//
// The sticky inner div pins once the container top reaches viewport top,
// which happens at scrollYProgress = 0.20 (after scrolling 100vh).
//
// Card timeline (all values in scrollYProgress):
//   0.00 – 0.15  section entering viewport, nothing visible yet
//   0.15 – 0.20  Card 0 fades in while section finishes entering
//   0.20 – 0.45  Card 0 fully visible (sticky is pinned, ~125vh of scroll)
//   0.45 – 0.50  Card 0 fades out
//   ---- gap ---- both cards invisible briefly
//   0.52 – 0.57  Card 1 fades in
//   0.57 – 0.72  Card 1 fully visible (~75vh of scroll)
//   0.72 – 0.77  Card 1 fades out
//   ---- gap ----
//   0.79 – 0.84  Card 2 fades in
//   0.84 – 1.00  Card 2 fully visible (~80vh of scroll)
// ---------------------------------------------------------------------------

const CardRenderer = ({
  step,
  opIn,
  opOut,
  yIn,
  yOut,
  scrollYProgress,
  z,
}: {
  step: (typeof steps)[0];
  opIn: number[];
  opOut: number[];
  yIn: number[];
  yOut: string[];
  scrollYProgress: MotionValue<number>;
  z: number;
}) => {
  const opacity = useTransform(scrollYProgress, opIn, opOut);
  const y = useTransform(scrollYProgress, yIn, yOut);

  return (
    <motion.div
      style={{ opacity, y, zIndex: z }}
      className="absolute top-0 left-0 w-full h-full flex flex-col lg:flex-row items-center justify-center p-6 sm:p-12 md:p-24 overflow-hidden pointer-events-none"
    >
      <div className="bg-white border-4 border-black shadow-[16px_16px_0px_#002BFF] md:shadow-[24px_24px_0px_#002BFF] flex flex-col lg:flex-row w-full max-w-6xl pointer-events-auto">
        {/* Left Side - Text */}
        <div className="flex-1 p-8 md:p-16 lg:p-20 flex flex-col justify-center border-b-4 lg:border-b-0 lg:border-r-4 border-black bg-white">
          <div className="font-fira text-sm md:text-base font-bold tracking-[0.2em] uppercase mb-6 text-[#002BFF]">
            {step.tag}
          </div>
          <h2 className="font-winky text-4xl md:text-6xl lg:text-7xl font-normal leading-[1.1] mb-6 tracking-wide text-black">
            {step.title}
          </h2>
          <p className="font-dm text-lg md:text-2xl leading-relaxed text-slate-800 font-medium max-w-xl">
            {step.description}
          </p>
        </div>

        {/* Right Side - Illustration */}
        <div className="flex-1 bg-[#F6F7FA] flex items-center justify-center p-12 md:p-24 relative overflow-hidden">
          {/* Blueprint Grid */}
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(#002BFF 2px, transparent 2px), linear-gradient(90deg, #002BFF 2px, transparent 2px)",
              backgroundSize: "40px 40px",
            }}
          />
          {/* Accent Crosshairs */}
          <div className="absolute top-8 left-8 w-4 h-4 border-t-2 border-l-2 border-[#002BFF] opacity-50" />
          <div className="absolute top-8 right-8 w-4 h-4 border-t-2 border-r-2 border-[#002BFF] opacity-50" />
          <div className="absolute bottom-8 left-8 w-4 h-4 border-b-2 border-l-2 border-[#002BFF] opacity-50" />
          <div className="absolute bottom-8 right-8 w-4 h-4 border-b-2 border-r-2 border-[#002BFF] opacity-50" />

          {/* Icon Box */}
          <div className="relative z-10 bg-white border-4 border-black p-8 md:p-12 shadow-[8px_8px_0px_#000] transform transition-transform duration-500 hover:scale-105 hover:-rotate-3">
            {step.icon}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const ProgressDot = ({
  active,
  scrollYProgress,
}: {
  active: [number, number]; // [start, end] range where this dot is active
  scrollYProgress: MotionValue<number>;
}) => {
  const opacity = useTransform(
    scrollYProgress,
    [active[0] - 0.02, active[0], active[1], active[1] + 0.02],
    [0.3, 1, 1, 0.3],
  );
  const scale = useTransform(
    scrollYProgress,
    [active[0] - 0.02, active[0], active[1], active[1] + 0.02],
    [1, 1.4, 1.4, 1],
  );
  const bgColor = useTransform(
    scrollYProgress,
    [active[0] - 0.02, active[0], active[1], active[1] + 0.02],
    ["#FFFFFF", "#002BFF", "#002BFF", "#FFFFFF"],
  );

  return (
    <motion.div
      style={{ opacity, scale, backgroundColor: bgColor }}
      className="w-3 h-3 md:w-4 md:h-4 border-2 border-black shadow-[2px_2px_0px_#000]"
    />
  );
};

export const StorytellingSection = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  // "start end" → progress=0 when container top hits viewport bottom
  // "end end"   → progress=1 when container bottom hits viewport bottom
  // This means the first 0.20 of progress is consumed by the section
  // scrolling into view — no card transitions happen during that phase.
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end end"],
  });

  return (
    <div ref={containerRef} className="relative w-full h-[500vh] bg-[#FFFFFF]">
      {/* Background Grid */}
      <div
        className="sticky top-0 h-screen pointer-events-none opacity-40"
        style={{
          backgroundImage: `
            linear-gradient(to right, #A0C4FF 1px, transparent 1px),
            linear-gradient(to bottom, #A0C4FF 1px, transparent 1px)
          `,
          backgroundSize: "100px 100px",
        }}
      />

      <div className="sticky top-0 w-full h-screen flex items-center justify-center overflow-hidden -mt-[100vh]">
        {/* Card 0 — fades in 0.15→0.20, holds, fades out 0.45→0.50 */}
        <CardRenderer
          step={steps[0]}
          opIn={[0.15, 0.2, 0.45, 0.5]}
          opOut={[0, 1, 1, 0]}
          yIn={[0.15, 0.2, 0.45, 0.5]}
          yOut={["8vh", "0vh", "0vh", "-8vh"]}
          scrollYProgress={scrollYProgress}
          z={3}
        />

        {/* Card 1 — fades in 0.52→0.57, holds, fades out 0.72→0.77 */}
        <CardRenderer
          step={steps[1]}
          opIn={[0.52, 0.57, 0.72, 0.77]}
          opOut={[0, 1, 1, 0]}
          yIn={[0.52, 0.57, 0.72, 0.77]}
          yOut={["8vh", "0vh", "0vh", "-8vh"]}
          scrollYProgress={scrollYProgress}
          z={2}
        />

        {/* Card 2 — fades in 0.79→0.84, holds until end */}
        <CardRenderer
          step={steps[2]}
          opIn={[0.79, 0.84]}
          opOut={[0, 1]}
          yIn={[0.79, 0.84]}
          yOut={["8vh", "0vh"]}
          scrollYProgress={scrollYProgress}
          z={1}
        />

        {/* Progress Dots */}
        <div className="absolute bottom-8 md:bottom-12 left-1/2 transform -translate-x-1/2 flex gap-4 md:gap-6 z-50">
          <ProgressDot active={[0.15, 0.5]} scrollYProgress={scrollYProgress} />
          <ProgressDot active={[0.52, 0.77]} scrollYProgress={scrollYProgress} />
          <ProgressDot active={[0.79, 1.0]} scrollYProgress={scrollYProgress} />
        </div>
      </div>
    </div>
  );
};
