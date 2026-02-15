"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Spinner } from "@/components/ui/Spinner";
import { getEvent, getEventStats } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import type { Event, EventStats } from "@/types";

export default function EventHomePage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const [event, setEvent] = useState<Event | null>(null);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [eventData, statsData] = await Promise.all([
          getEvent(eventId),
          getEventStats(eventId),
        ]);
        setEvent(eventData);
        setStats(statsData);
      } catch {
        router.push("/");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [eventId, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!event) return null;

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Background mesh */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-48 -right-48 w-[550px] h-[550px] rounded-full bg-gradient-pink/22 blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 w-[450px] h-[450px] rounded-full bg-gradient-blue/10 blur-[100px]" />
        <div className="absolute top-1/2 left-1/3 w-[350px] h-[350px] rounded-full bg-gradient-purple/8 blur-[100px]" />

        <div className="absolute top-[18%] right-[14%] w-1.5 h-1.5 rounded-full bg-gradient-purple/45 animate-sparkle" />
        <div className="absolute bottom-[22%] left-[18%] w-1 h-1 rounded-full bg-rose-accent/30 animate-sparkle" style={{ animationDelay: "1.4s" }} />
        <div className="absolute top-[52%] right-[22%] w-1 h-1 rounded-full bg-sage/40 animate-sparkle" style={{ animationDelay: "0.7s" }} />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5 relative z-10 py-12">
        <div className="w-full max-w-md space-y-10">
          {/* Header */}
          <div className="text-center animate-fade-in">
            {/* Small logo */}
            <div className="mx-auto w-14 h-14 mb-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/new-app/logo.png"
                alt="WedFind"
                width={56}
                height={56}
                className="w-full h-full object-contain"
              />
            </div>

            <p className="text-warm-400 text-[11px] font-semibold uppercase tracking-[0.2em] mb-2">
              Welcome to
            </p>
            <h1
              className="text-3xl sm:text-4xl font-bold text-warm-900 tracking-tight leading-tight"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              {event.name}
            </h1>

            {/* Stats */}
            {stats && stats.image_count > 0 && (
              <div className="flex items-center justify-center gap-3 mt-5">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 glass rounded-full text-sm text-warm-600 font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                  </svg>
                  {stats.image_count} photos
                </span>
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 glass rounded-full text-sm text-warm-600 font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                  {stats.face_count} faces
                </span>
              </div>
            )}
          </div>

          {/* Action cards */}
          <div className="space-y-3.5 animate-slide-up stagger-1">
            {/* Hero: Find My Photos */}
            <Link href={`/event/${eventId}/find`} className="block group">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gradient-purple via-warm-800 to-warm-900 p-6 shadow-lg glow-purple transition-all duration-300 group-hover:scale-[1.015]">
                {/* Subtle inner glow */}
                <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-gradient-pink/15 blur-2xl pointer-events-none" />
                <div className="relative flex items-center gap-4">
                  <div className="w-13 h-13 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0" style={{ width: 52, height: 52 }}>
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white">Find My Photos</h3>
                    <p className="text-sm text-white/55 mt-0.5">Take a selfie to find photos of you</p>
                  </div>
                  <svg className="w-5 h-5 text-white/35 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </div>
            </Link>

            {/* Upload */}
            <Link href={`/event/${eventId}/upload`} className="block group">
              <div className="glass rounded-2xl p-5 transition-all duration-300 group-hover:bg-white/70 group-hover:shadow-md group-hover:scale-[1.01]">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-warm-100 flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6 text-warm-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-warm-900">Upload Photos</h3>
                    <p className="text-sm text-warm-500 mt-0.5">Share photos from the event</p>
                  </div>
                  <svg className="w-5 h-5 text-warm-300 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </div>
            </Link>

            {/* Gallery */}
            <Link href={`/event/${eventId}/gallery`} className="block group">
              <div className="glass rounded-2xl p-5 transition-all duration-300 group-hover:bg-white/70 group-hover:shadow-md group-hover:scale-[1.01]">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-warm-100 flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6 text-warm-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-warm-900">Browse Gallery</h3>
                    <p className="text-sm text-warm-500 mt-0.5">View all event photos</p>
                  </div>
                  <svg className="w-5 h-5 text-warm-300 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </div>
            </Link>

            {/* Albums */}
            <Link href={`/event/${eventId}/albums`} className="block group">
              <div className="glass rounded-2xl p-5 transition-all duration-300 group-hover:bg-white/70 group-hover:shadow-md group-hover:scale-[1.01]">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-purple/8 flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6 text-gradient-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-warm-900">Albums</h3>
                    <p className="text-sm text-warm-500 mt-0.5">AI-curated wedding moment albums</p>
                  </div>
                  <svg className="w-5 h-5 text-warm-300 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </div>
            </Link>
          </div>

          {/* Storage */}
          {stats && stats.storage_used_bytes > 0 && (
            <p className="text-center text-xs text-warm-400 animate-slide-up stagger-2">
              {formatBytes(stats.storage_used_bytes)} stored
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
