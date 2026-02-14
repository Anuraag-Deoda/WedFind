"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-warm-800 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-cream" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-warm-900 tracking-tight">
            Wedding Photo Finder
          </h1>
          <p className="text-warm-500 text-lg">
            Find every photo you&apos;re in with a single selfie
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="code"
            label="Event Code"
            placeholder="Enter your event code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError("");
            }}
            error={error}
            className="text-center text-lg tracking-widest uppercase"
          />
          <Button
            type="submit"
            loading={loading}
            className="w-full"
            size="lg"
            disabled={!code.trim()}
          >
            Join Event
          </Button>
        </form>

        <p className="text-center text-sm text-warm-400">
          Ask the photographer for your event code
        </p>
      </div>
    </div>
  );
}
