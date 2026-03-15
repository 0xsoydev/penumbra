"use client";

import { AuctionPhase, PHASE_COLORS, PHASE_LABELS } from "~~/types/auction";

type PhaseIndicatorProps = {
  phase: AuctionPhase;
  size?: "sm" | "md" | "lg";
};

export const PhaseIndicator = ({ phase, size = "md" }: PhaseIndicatorProps) => {
  const sizeClass = size === "sm" ? "badge-sm" : size === "lg" ? "badge-lg" : "badge-md";

  return (
    <span className={`badge ${PHASE_COLORS[phase]} ${sizeClass} font-fira font-bold uppercase tracking-wider`}>
      {PHASE_LABELS[phase]}
    </span>
  );
};
