"use client";

import type { NextPage } from "next";
import { AuctionList } from "~~/components/penumbra/AuctionList";
import { Hero } from "~~/components/penumbra/Hero";
import { StorytellingSection } from "~~/components/penumbra/StorytellingSection";

const Home: NextPage = () => {
  return (
    <div className="flex flex-col flex-1 min-h-screen bg-white">
      <Hero />
      <StorytellingSection />
      <AuctionList />
    </div>
  );
};

export default Home;
