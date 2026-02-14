"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
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
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-gradient-pink/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-sage/8 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/3 w-[300px] h-[300px] bg-gradient-purple/8 rounded-full blur-3xl" />

        {/* Sparkles */}
        <div className="absolute top-[20%] right-[15%] w-1.5 h-1.5 bg-gradient-purple/40 rounded-full animate-sparkle" />
        <div className="absolute bottom-[25%] left-[20%] w-1 h-1 bg-rose-accent/30 rounded-full animate-sparkle" style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-[55%] right-[25%] w-1 h-1 bg-sage/40 rounded-full animate-sparkle" style={{ animationDelay: "0.8s" }} />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 relative z-10 py-12">
        <div className="w-full max-w-md space-y-8">
          {/* Event header */}
          <div className="text-center animate-fade-in">
            <div className="mx-auto w-16 h-16 mb-4 relative">
              <Image
                src="/logo.png"
                alt="Brinx Photos"
                width={64}
                height={64}
                className="w-full h-full object-contain"
              />
            </div>
            <p className="text-warm-400 text-xs font-medium uppercase tracking-[0.2em] mb-3">
              Welcome to
            </p>
            <h1
              className="text-3xl sm:text-4xl font-bold text-warm-900 tracking-tight leading-tight"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              {event.name}
            </h1>

            {/* Stats pills */}
            {stats && stats.image_count > 0 && (
              <div className="flex items-center justify-center gap-3 mt-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/60 backdrop-blur-sm rounded-full text-sm text-warm-600 border border-warm-200/50">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                  </svg>
                  {stats.image_count} photos
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/60 backdrop-blur-sm rounded-full text-sm text-warm-600 border border-warm-200/50">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                  {stats.face_count} faces
                </span>
              </div>
            )}
          </div>

          {/* Action cards */}
          <div className="space-y-3 animate-slide-up stagger-1">
            {/* Primary: Find My Photos */}
            <Link href={`/event/${eventId}/find`} className="block group">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gradient-purple to-warm-900 p-5 shadow-lg shadow-gradient-purple/20 transition-all duration-300 group-hover:shadow-xl group-hover:shadow-gradient-purple/30 group-hover:scale-[1.01]">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white">Find My Photos</h3>
                    <p className="text-sm text-white/60 mt-0.5">Take a selfie to find all photos of you</p>
                  </div>
                  <svg className="w-5 h-5 text-white/40 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </div>
            </Link>

            {/* Upload Photos */}
            <Link href={`/event/${eventId}/upload`} className="block group">
              <div className="rounded-2xl bg-white/60 backdrop-blur-sm p-5 border border-warm-200/50 transition-all duration-300 group-hover:bg-white/80 group-hover:shadow-md group-hover:scale-[1.01]">
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

            {/* Browse Gallery */}
            <Link href={`/event/${eventId}/gallery`} className="block group">
              <div className="rounded-2xl bg-white/60 backdrop-blur-sm p-5 border border-warm-200/50 transition-all duration-300 group-hover:bg-white/80 group-hover:shadow-md group-hover:scale-[1.01]">
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
          </div>

          {/* Storage info */}
          {stats && stats.storage_used_bytes > 0 && (
            <p className="text-center text-xs text-warm-400 animate-slide-up stagger-2">
              {formatBytes(stats.storage_used_bytes)} of photos stored
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
