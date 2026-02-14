"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { lookupEvent } from "@/lib/api";

export default function LandingPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError("");

    try {
      const data = await lookupEvent(code.trim().toUpperCase());
      router.push(`/event/${data.event_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Event not found");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* ── Background mesh ─────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Large soft orbs matching logo palette */}
        <div className="absolute -top-48 -right-48 w-[600px] h-[600px] rounded-full bg-gradient-pink/30 blur-[120px]" />
        <div className="absolute top-1/4 -left-48 w-[500px] h-[500px] rounded-full bg-gradient-purple/14 blur-[100px]" />
        <div className="absolute -bottom-48 right-1/4 w-[550px] h-[550px] rounded-full bg-gradient-blue/10 blur-[120px]" />

        {/* Sparkle dots */}
        <div className="absolute top-[12%] right-[18%] w-1.5 h-1.5 rounded-full bg-gradient-purple/50 animate-sparkle" />
        <div className="absolute top-[38%] left-[12%] w-2 h-2 rounded-full bg-rose-accent/35 animate-sparkle" style={{ animationDelay: "0.8s" }} />
        <div className="absolute bottom-[28%] right-[28%] w-1 h-1 rounded-full bg-sage/50 animate-sparkle" style={{ animationDelay: "1.6s" }} />
        <div className="absolute top-[58%] right-[8%] w-1.5 h-1.5 rounded-full bg-gold/35 animate-sparkle" style={{ animationDelay: "0.4s" }} />
        <div className="absolute top-[22%] left-[28%] w-1 h-1 rounded-full bg-gradient-purple/35 animate-sparkle" style={{ animationDelay: "1.2s" }} />
        <div className="absolute bottom-[42%] left-[8%] w-1 h-1 rounded-full bg-rose-accent/25 animate-sparkle" style={{ animationDelay: "2s" }} />
      </div>

      {/* ── Main content ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 relative z-10">
        <div className="w-full max-w-sm space-y-12">

          {/* Brand block */}
          <div className="text-center animate-fade-in">
            {/* Logo with glow */}
            <div className="relative mx-auto w-36 h-36 mb-8">
              <div className="absolute inset-[-20%] rounded-full bg-gradient-purple/25 blur-3xl animate-glow-pulse" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/new-app/logo.png"
                alt="WedFind"
                width={144}
                height={144}
                className="relative z-10 w-full h-full object-contain drop-shadow-xl"
              />
            </div>

            <h1
              className="text-5xl sm:text-6xl font-extrabold tracking-tight gradient-text leading-[1.1]"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              WedFind
            </h1>
            <p className="text-warm-400 text-base sm:text-lg mt-4 max-w-xs mx-auto leading-relaxed">
              AI-powered wedding photo discovery
            </p>
          </div>

          {/* Input card */}
          <div className="animate-slide-up stagger-1">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="glass rounded-3xl p-7 shadow-lg shadow-warm-800/5">
                <label
                  htmlFor="code"
                  className="block text-[11px] font-semibold text-warm-400 uppercase tracking-[0.15em] mb-3"
                >
                  Event Code
                </label>
                <input
                  id="code"
                  type="text"
                  placeholder="ABCD1234"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setError("");
                  }}
                  className="w-full text-center text-2xl sm:text-3xl tracking-[0.35em] font-bold text-warm-900 bg-transparent border-b-2 border-warm-200 focus:border-gradient-purple outline-none py-3 placeholder-warm-300/60 uppercase transition-colors duration-300"
                  autoComplete="off"
                  autoFocus
                />
                {error && (
                  <p className="text-sm text-rose-accent mt-3 text-center font-medium">{error}</p>
                )}
              </div>

              <Button
                type="submit"
                loading={loading}
                className="w-full glow-purple"
                size="lg"
                disabled={!code.trim()}
              >
                Find My Photos
              </Button>
            </form>
          </div>

          {/* Hint */}
          <p className="text-center text-sm text-warm-300 animate-slide-up stagger-2">
            Ask your photographer for the event code
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="py-5 text-center relative z-10">
        <p className="text-[11px] text-warm-300/70 tracking-wide">Powered by WedFind AI</p>
      </div>
    </div>
  );
}
