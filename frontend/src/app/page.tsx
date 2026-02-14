"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
      {/* Animated gradient background orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-gradient-pink/25 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-40 w-[400px] h-[400px] bg-gradient-purple/12 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 right-1/4 w-[450px] h-[450px] bg-sage/8 rounded-full blur-3xl" />

        {/* Sparkle particles */}
        <div className="absolute top-[15%] right-[20%] w-2 h-2 bg-gradient-purple/40 rounded-full animate-sparkle" />
        <div className="absolute top-[40%] left-[15%] w-1.5 h-1.5 bg-rose-accent/30 rounded-full animate-sparkle" style={{ animationDelay: "1s" }} />
        <div className="absolute bottom-[30%] right-[30%] w-1 h-1 bg-sage/40 rounded-full animate-sparkle" style={{ animationDelay: "2s" }} />
        <div className="absolute top-[60%] right-[10%] w-1.5 h-1.5 bg-gold/30 rounded-full animate-sparkle" style={{ animationDelay: "0.5s" }} />
        <div className="absolute top-[25%] left-[30%] w-1 h-1 bg-gradient-purple/30 rounded-full animate-sparkle" style={{ animationDelay: "1.5s" }} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 relative z-10">
        <div className="w-full max-w-sm space-y-10">
          {/* Logo & branding */}
          <div className="text-center animate-fade-in">
            <div className="mx-auto w-32 h-32 mb-6 relative">
              <div className="absolute inset-0 bg-gradient-purple/20 rounded-full blur-2xl animate-glow-pulse" />
              <Image
                src="/logo.png"
                alt="Brinx Photos"
                width={128}
                height={128}
                className="w-full h-full object-contain relative z-10 drop-shadow-lg"
                priority
              />
            </div>
            <h1
              className="text-4xl font-extrabold tracking-tight gradient-text"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              Brinx Photos
            </h1>
            <p className="text-warm-400 text-base mt-3 max-w-xs mx-auto leading-relaxed">
              Find every photo you&apos;re in with AI-powered face recognition
            </p>
          </div>

          {/* Code input card */}
          <div className="animate-slide-up stagger-1">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-white/60 backdrop-blur-xl rounded-2xl p-6 shadow-lg shadow-warm-700/5 border border-warm-200/50">
                <label htmlFor="code" className="block text-xs font-medium text-warm-500 uppercase tracking-wider mb-2">
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
                  className="w-full text-center text-2xl tracking-[0.3em] font-semibold text-warm-900 bg-transparent border-b-2 border-warm-200 focus:border-gradient-purple outline-none py-3 placeholder-warm-300 uppercase transition-colors"
                  autoComplete="off"
                  autoFocus
                />
                {error && (
                  <p className="text-sm text-rose-accent mt-3 text-center">{error}</p>
                )}
              </div>

              <Button
                type="submit"
                loading={loading}
                className="w-full glow-primary"
                size="lg"
                disabled={!code.trim()}
              >
                Join Event
              </Button>
            </form>
          </div>

          {/* Bottom hint */}
          <p className="text-center text-sm text-warm-300 animate-slide-up stagger-2">
            Ask your photographer for the event code
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="py-4 text-center relative z-10">
        <p className="text-xs text-warm-300">Powered by Brinx AI</p>
      </div>
    </div>
  );
}
