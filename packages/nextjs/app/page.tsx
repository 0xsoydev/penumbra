"use client";

import { useState } from "react";
import localFont from "next/font/local";
import Image from "next/image";
import type { NextPage } from "next";

// Configure Winky Milky font
const winkyMilky = localFont({
  src: "./fonts/Winky Milky.ttf",
  variable: "--font-winky",
});

const NAV_ITEMS = ["HOME", "ABOUT", "WORK", "CREW", "CAREERS", "STORES", "CONTACT"] as const;
type NavItem = (typeof NAV_ITEMS)[number];

/* ── Interactive hover grid ── */
// Increased grid density for better "square" look
const COLS = 32;
const ROWS = 20;
const TOTAL = COLS * ROWS;

const HoverGrid = () => {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div
      className="absolute inset-0"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
        gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        zIndex: 1,
      }}
      onMouseLeave={() => setHovered(null)}
    >
      {Array.from({ length: TOTAL }).map((_, i) => (
        <div
          key={i}
          // Only the exact hovered cell lights up
          className="transition-colors duration-0 ease-linear"
          style={{
            border: "0.5px solid rgba(75,53,247,0.08)",
            backgroundColor: hovered === i ? "rgba(75,53,247,0.4)" : "transparent",
          }}
          onMouseEnter={() => setHovered(i)}
        />
      ))}
    </div>
  );
};

const Home: NextPage = () => {
  const [active, setActive] = useState<NavItem>("HOME");
  const [isDark, setIsDark] = useState(false);

  const bg = isDark ? "#111111" : "#f4ece3";
  const fg = isDark ? "#f4ece3" : "#111111";
  const accent = "#4b35f7";

  const handleNav = (item: NavItem) => {
    setActive(item);
    const el = document.getElementById(item.toLowerCase());
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={`w-full font-sans ${winkyMilky.variable}`} style={{ backgroundColor: bg, color: fg }}>
      {/* ══════════════════════════════════════════
          HERO — full-viewport  |  p-8 = even more blue
      ══════════════════════════════════════════ */}
      <section id="home" className="w-full h-screen bg-[#4b35f7] p-8 flex" style={{ minHeight: "100dvh" }}>
        {/* Inner cream / dark rectangle */}
        <div
          className="relative flex-1 rounded-[24px] overflow-hidden transition-colors duration-300 shadow-[0_0_0_1px_rgba(0,0,0,0.1)]"
          style={{ backgroundColor: bg }}
        >
          {/* Interactive hover grid */}
          <HoverGrid />

          {/* Texture squares — behind UI, behind grid */}
          {[
            [80, 320],
            [240, 480],
            [480, 240],
            [560, 800],
            [160, 880],
            [400, 1040],
            [640, 560],
          ].map(([t, l], i) => (
            <div
              key={i}
              className="absolute pointer-events-none"
              style={{
                top: t,
                left: l,
                width: 80,
                height: 80,
                zIndex: 0,
                backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "#e8e0d6",
              }}
            />
          ))}

          {/* ── Top bar ── */}
          <div className="absolute top-0 left-0 w-full px-8 py-6 flex justify-between items-start z-20">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-full overflow-hidden shadow-md flex-shrink-0 transition-transform hover:scale-105">
              <Image
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=Dash&backgroundColor=b6e3f4"
                alt="Avatar"
                width={56}
                height={56}
                className="w-full h-full object-cover bg-white"
              />
            </div>

            {/* Centre logo */}
            <div
              className="font-black text-[28px] leading-[0.9] p-3 pt-4 tracking-widest text-center cursor-pointer select-none transition-transform hover:scale-105"
              style={{ backgroundColor: fg, color: bg }}
              onClick={() => handleNav("HOME")}
            >
              <span className="block">DA</span>
              <span className="block">SH</span>
            </div>

            {/* Nav drawer */}
            <div
              className="w-[190px] border-[1.5px] flex flex-col shadow-[4px_4px_0px_0px_rgba(0,0,0,0.08)] transition-transform hover:scale-105"
              style={{ backgroundColor: bg, borderColor: fg }}
            >
              <div
                className="text-[10px] font-bold p-3 px-4 flex justify-between items-center tracking-widest"
                style={{ backgroundColor: fg, color: bg }}
              >
                <span>DASHBOARD</span>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: bg }} />
              </div>

              <div className="p-5 py-4 flex flex-col gap-[11px] text-[11px] font-bold tracking-[0.15em]">
                {NAV_ITEMS.map(item => (
                  <button
                    key={item}
                    onClick={() => handleNav(item)}
                    className="flex items-center justify-between w-full text-left transition-colors duration-150 hover:opacity-60 group"
                    style={{ color: active === item ? accent : fg }}
                  >
                    <span>{item}</span>
                    {active === item && (
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
                    )}
                  </button>
                ))}
              </div>

              {/* Light / Dark toggle */}
              <div
                className="px-5 py-4 border-t-[1.5px] flex flex-col gap-3 text-[10px] font-bold tracking-widest"
                style={{ borderColor: `${fg}33` }}
              >
                {([false, true] as const).map(dark => (
                  <button
                    key={String(dark)}
                    onClick={() => setIsDark(dark)}
                    className="flex items-center gap-3 w-full transition-opacity"
                    style={{ color: fg, opacity: isDark === dark ? 1 : 0.38 }}
                  >
                    <div
                      className="w-[13px] h-[13px] rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0"
                      style={{ borderColor: fg }}
                    >
                      {isDark === dark && (
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
                      )}
                    </div>
                    {dark ? "DARK" : "LIGHT"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── CTA — moved up from bottom ── */}
          <div className="absolute bottom-[26%] left-[8%] z-20 select-none">
            <p className="font-bold text-xs tracking-[0.25em] mb-5" style={{ color: accent }}>
              THIS IS DASH
            </p>

            <div className="flex items-center flex-wrap gap-y-2 font-black">
              <div
                className="transform -rotate-[3deg] px-6 py-1 shadow-lg origin-bottom-left"
                style={{ backgroundColor: accent }}
              >
                <span
                  className="text-5xl md:text-7xl lg:text-[90px] tracking-[-0.03em] block uppercase leading-none pt-2 font-winky"
                  style={{ color: bg }}
                >
                  ALMOST
                </span>
              </div>
              <span
                className="text-5xl md:text-7xl lg:text-[90px] tracking-[-0.03em] ml-5 uppercase leading-none pt-2 font-winky"
                style={{ color: fg }}
              >
                THE
              </span>
              <span className="text-2xl md:text-4xl ml-1 self-start mt-3" style={{ color: accent }}>
                *
              </span>
            </div>

            <div
              className="text-5xl md:text-7xl lg:text-[90px] font-black tracking-[-0.03em] leading-[0.9] mt-4 uppercase font-winky"
              style={{ color: fg }}
            >
              BEST TECH
            </div>
            <div
              className="text-5xl md:text-7xl lg:text-[90px] font-black tracking-[-0.03em] leading-[0.9] uppercase mt-1 font-winky"
              style={{ color: fg }}
            >
              COMPANY
            </div>

            <div className="mt-10 flex items-center gap-4">
              <button
                onClick={() => handleNav("ABOUT")}
                className="px-8 py-4 text-xs font-black tracking-widest uppercase border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:bg-black active:text-white"
                style={{ backgroundColor: accent, color: "#f4ece3" }}
              >
                EXPLORE →
              </button>
              <button
                onClick={() => handleNav("WORK")}
                className="px-8 py-4 text-xs font-black tracking-widest uppercase border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:bg-black active:text-white"
                style={{ borderColor: fg, color: fg }}
              >
                OUR WORK
              </button>
            </div>
          </div>
        </div>
        {/* end rectangle */}
      </section>

      {/* ══════════════════════════════════════════
          SCROLL SECTIONS
      ══════════════════════════════════════════ */}

      {/* ── ABOUT ── */}
      <section
        id="about"
        className="w-full min-h-screen flex flex-col md:flex-row transition-colors duration-300"
        style={{ backgroundColor: accent, color: "#f4ece3" }}
      >
        <div className="flex-1 flex flex-col justify-center px-[8%] py-20">
          <p className="text-[10px] font-bold tracking-[0.3em] mb-6 opacity-60">01 — ABOUT</p>
          <h2 className="text-5xl md:text-7xl font-black tracking-tight uppercase leading-[0.9] mb-10 font-winky">
            Who
            <br />
            We Are
          </h2>
          <p className="max-w-md text-lg leading-relaxed opacity-80 border-l-4 border-black pl-6">
            DASH is a design-first technology studio building products at the intersection of web3, privacy, and
            beautiful interfaces. We obsess over craft, clarity, and impact.
          </p>
        </div>
        <div
          className="w-full md:w-[45%] flex items-center justify-center p-12 border-l-2 border-black"
          style={{ backgroundColor: "rgba(0,0,0,0.12)" }}
        >
          <div className="text-[120px] md:text-[200px] font-black leading-none tracking-[-0.05em] opacity-20 select-none font-winky">
            01
          </div>
        </div>
      </section>

      {/* ── WORK ── */}
      <section
        id="work"
        className="w-full py-24 px-[6%] transition-colors duration-300"
        style={{ backgroundColor: bg, color: fg }}
      >
        <p className="text-[10px] font-bold tracking-[0.3em] mb-4 opacity-50">02 — WORK</p>
        <h2 className="text-5xl md:text-7xl font-black tracking-tight uppercase leading-[0.9] mb-16 font-winky">
          Selected
          <br />
          Projects
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { name: "Penumbra", desc: "Privacy-first Web3 protocol", tag: "Web3" },
            { name: "DarkAuction", desc: "Sealed-bid OTC auction engine", tag: "DeFi" },
            { name: "Stealth Pay", desc: "Anonymous on-chain payments", tag: "Privacy" },
          ].map((proj, i) => (
            <div
              key={proj.name}
              className="group p-10 border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] cursor-pointer transition-all duration-200 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none hover:bg-[#4b35f7] hover:text-[#f4ece3]"
            >
              <p className="text-[10px] tracking-widest font-bold mb-6 opacity-40">0{i + 1}</p>
              <h3 className="text-2xl font-black tracking-wide uppercase mb-3 font-winky">{proj.name}</h3>
              <p className="text-sm opacity-60 mb-6">{proj.desc}</p>
              <span className="inline-block text-[9px] font-black tracking-[0.2em] px-3 py-1 border-2 border-black opacity-50 bg-white text-black">
                {proj.tag}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── CREW ── */}
      <section
        id="crew"
        className="w-full py-24 px-[6%] transition-colors duration-300"
        style={{ backgroundColor: isDark ? "#1a1a1a" : "#111111", color: "#f4ece3" }}
      >
        <p className="text-[10px] font-bold tracking-[0.3em] mb-4 opacity-40">03 — CREW</p>
        <h2 className="text-5xl md:text-7xl font-black tracking-tight uppercase leading-[0.9] mb-16 font-winky">
          The Team
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {["Alice", "Bob", "Carol", "Dave"].map(name => (
            <div key={name} className="group cursor-pointer">
              <div className="w-full aspect-square rounded-2xl overflow-hidden mb-4 bg-[#222] border-2 border-[#f4ece3] shadow-[4px_4px_0px_0px_#f4ece3] transition-all group-hover:shadow-none group-hover:translate-x-[2px] group-hover:translate-y-[2px]">
                <Image
                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${name}&backgroundColor=b6e3f4`}
                  alt={name}
                  width={200}
                  height={200}
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="font-black text-sm tracking-widest uppercase group-hover:text-[#4b35f7] transition-colors">
                {name}
              </p>
              <p className="text-[10px] tracking-widest opacity-40 mt-1">Builder</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CAREERS ── */}
      <section
        id="careers"
        className="w-full min-h-[60vh] flex flex-col justify-center px-[8%] py-24 transition-colors duration-300"
        style={{ backgroundColor: bg, color: fg }}
      >
        <p className="text-[10px] font-bold tracking-[0.3em] mb-4 opacity-50">04 — CAREERS</p>
        <h2 className="text-5xl md:text-7xl font-black tracking-tight uppercase leading-[0.9] mb-8 font-winky">
          Join Us
        </h2>
        <p className="max-w-lg text-lg leading-relaxed mb-10 opacity-70 border-l-4 border-black pl-6">
          We&apos;re always looking for bold, curious builders. Drop us a line.
        </p>
        <button
          className="self-start px-10 py-4 text-xs font-black tracking-widest uppercase border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none hover:bg-[#4b35f7] hover:text-[#f4ece3]"
          style={{ borderColor: fg, color: fg }}
          onClick={() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })}
        >
          Get In Touch →
        </button>
      </section>

      {/* ── STORES ── */}
      <section
        id="stores"
        className="w-full py-24 px-[6%] transition-colors duration-300"
        style={{ backgroundColor: accent, color: "#f4ece3" }}
      >
        <p className="text-[10px] font-bold tracking-[0.3em] mb-4 opacity-60">05 — STORES</p>
        <h2 className="text-5xl md:text-7xl font-black tracking-tight uppercase leading-[0.9] mb-16 font-winky">
          Find Us
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
          {["New York", "Berlin"].map(city => (
            <div
              key={city}
              className="border-2 border-black bg-[#f4ece3] text-black p-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all cursor-pointer"
            >
              <p className="font-black text-2xl tracking-widest uppercase mb-2 font-winky">{city}</p>
              <p className="text-sm opacity-60">Open Mon–Fri, 9am–6pm</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section
        id="contact"
        className="w-full py-24 px-[8%] transition-colors duration-300"
        style={{ backgroundColor: bg, color: fg }}
      >
        <p className="text-[10px] font-bold tracking-[0.3em] mb-4 opacity-50">06 — CONTACT</p>
        <h2 className="text-5xl md:text-7xl font-black tracking-tight uppercase leading-[0.9] mb-16 font-winky">
          Say Hello
        </h2>
        <form
          className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl"
          onSubmit={e => {
            e.preventDefault();
            alert("Message sent!");
          }}
        >
          <input
            type="text"
            placeholder="Your name"
            required
            className="border-2 border-black bg-white p-4 text-sm tracking-wide outline-none focus:shadow-[4px_4px_0px_0px_#4b35f7] transition-all text-black"
          />
          <input
            type="email"
            placeholder="Email address"
            required
            className="border-2 border-black bg-white p-4 text-sm tracking-wide outline-none focus:shadow-[4px_4px_0px_0px_#4b35f7] transition-all text-black"
          />
          <textarea
            placeholder="Your message"
            rows={4}
            required
            className="border-2 border-black bg-white p-4 text-sm tracking-wide outline-none resize-none focus:shadow-[4px_4px_0px_0px_#4b35f7] transition-all md:col-span-2 text-black"
          />
          <div className="md:col-span-2">
            <button
              type="submit"
              className="px-12 py-4 text-xs font-black tracking-widest uppercase border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:bg-black active:text-white"
              style={{ backgroundColor: accent, color: "#f4ece3" }}
            >
              SEND MESSAGE →
            </button>
          </div>
        </form>
      </section>

      {/* ── Footer ── */}
      <footer
        className="w-full px-[8%] py-8 flex justify-between items-center text-[10px] font-bold tracking-widest border-t-2 border-black transition-colors duration-300"
        style={{ backgroundColor: bg, color: `${fg}44` }}
      >
        <span>© 2026 DASH</span>
        <span>ALL RIGHTS RESERVED</span>
      </footer>
    </div>
  );
};

export default Home;
