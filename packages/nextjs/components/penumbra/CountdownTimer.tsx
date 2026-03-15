"use client";

import { useEffect, useState } from "react";

type CountdownTimerProps = {
  deadline: bigint;
  label: string;
};

export const CountdownTimer = ({ deadline, label }: CountdownTimerProps) => {
  const [timeLeft, setTimeLeft] = useState("");
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = Number(deadline) - now;

      if (diff <= 0) {
        setTimeLeft("Expired");
        setIsExpired(true);
        return;
      }

      const days = Math.floor(diff / 86400);
      const hours = Math.floor((diff % 86400) / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;

      const parts: string[] = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0) parts.push(`${hours}h`);
      parts.push(`${minutes}m`);
      parts.push(`${seconds}s`);

      setTimeLeft(parts.join(" "));
      setIsExpired(false);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return (
    <div className="flex flex-col items-center">
      <span className="font-fira text-xs font-bold uppercase tracking-[0.15em] opacity-60">{label}</span>
      <span className={`font-fira text-lg font-bold ${isExpired ? "text-error" : "text-base-content"}`}>
        {timeLeft}
      </span>
    </div>
  );
};
