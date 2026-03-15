"use client";

import { useRef } from "react";
import { MotionValue, motion, useScroll, useTransform } from "framer-motion";

const steps = [
  {
    title: "The Problem",
    description: "Public auctions expose your bids and strategies. Everyone sees what you're doing.",
    color: "bg-[#ff0000]",
    textColor: "text-white",
  },
  {
    title: "The Solution",
    description: "Penumbra uses stealth addresses and sealed bids for complete privacy.",
    color: "bg-[#0066FF]",
    textColor: "text-white",
  },
  {
    title: "The Process",
    description: "Commit your bid secretly. No one knows your bid amount until the reveal phase.",
    color: "bg-[#E5E5E5]",
    textColor: "text-black",
  },
  {
    title: "The Reveal",
    description: "Reveal your bid when the auction ends. Trustless, secure, and fair.",
    color: "bg-black",
    textColor: "text-white",
  },
];

const StoryStep = ({
  step,
  index,
  scrollYProgress,
}: {
  step: (typeof steps)[0];
  index: number;
  scrollYProgress: MotionValue<number>;
}) => {
  const start = index * 0.25;
  const end = (index + 1) * 0.25;

  const opacity = useTransform(scrollYProgress, [start - 0.05, start, end - 0.05, end], [0, 1, 1, 0]);
  const scale = useTransform(scrollYProgress, [start, start + 0.1, end - 0.1, end], [0.8, 1, 1, 1.2]);
  const y = useTransform(scrollYProgress, [start - 0.1, start, end - 0.1, end], [100, 0, 0, -100]);
  const zIndex = useTransform(scrollYProgress, [start, end], [10, 10]);

  return (
    <motion.div
      style={{ opacity, scale, y, zIndex }}
      className={`absolute w-full max-w-4xl p-8 md:p-16 border-4 border-black shadow-[12px_12px_0px_rgba(0,0,0,1)] ${step.color} flex flex-col items-center justify-center text-center`}
    >
      <h2 className={`text-4xl md:text-6xl font-black mb-6 uppercase tracking-wider ${step.textColor}`}>
        {step.title}
      </h2>
      <p className={`text-xl md:text-3xl font-bold leading-tight ${step.textColor}`}>{step.description}</p>
    </motion.div>
  );
};

const ProgressDot = ({ index, scrollYProgress }: { index: number; scrollYProgress: MotionValue<number> }) => {
  const start = index * 0.25;
  const end = (index + 1) * 0.25;
  const isActive = useTransform(scrollYProgress, [start, start + 0.01, end - 0.01, end], [0, 1, 1, 0]);

  return (
    <motion.div
      style={{ opacity: isActive }}
      className="w-4 h-4 rounded-full bg-black border-2 border-white shadow-[2px_2px_0px_rgba(0,0,0,1)]"
    />
  );
};

export const StorytellingSection = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  return (
    <div ref={containerRef} className="relative w-full h-[400vh] bg-white">
      <div className="sticky top-0 w-full h-screen flex items-center justify-center overflow-hidden px-4 md:px-12">
        {steps.map((step, index) => (
          <StoryStep key={index} step={step} index={index} scrollYProgress={scrollYProgress} />
        ))}

        {/* Progress Indicator */}
        <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 flex gap-4 z-50">
          {steps.map((_, index) => (
            <ProgressDot key={index} index={index} scrollYProgress={scrollYProgress} />
          ))}
        </div>
      </div>
    </div>
  );
};
