"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { listAlbums, generateAlbum, deleteAlbum } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Album } from "@/types";

export default function AlbumsPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAlbums = useCallback(async () => {
    try {
      const data = await listAlbums(eventId);
      setAlbums(data.albums);
    } catch {
      setError("Failed to load albums");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadAlbums();
  }, [loadAlbums]);

  // Poll for generating albums
  useEffect(() => {
    const hasGenerating = albums.some((a) => a.status === "generating" || a.status === "pending");
    if (!hasGenerating) return;

    const interval = setInterval(loadAlbums, 3000);
    return () => clearInterval(interval);
  }, [albums, loadAlbums]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      await generateAlbum(eventId);
      await loadAlbums();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate album");
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (albumId: string) => {
    if (!confirm("Delete this album? This cannot be undone.")) return;
    try {
      await deleteAlbum(eventId, albumId);
      await loadAlbums();
    } catch {
      setError("Failed to delete album");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-48 -right-48 w-[550px] h-[550px] bg-gradient-pink/20 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 w-[450px] h-[450px] bg-gradient-blue/10 rounded-full blur-[100px]" />
        <div className="absolute top-1/3 left-1/4 w-[350px] h-[350px] bg-gradient-purple/8 rounded-full blur-[100px]" />
        <div className="absolute top-[15%] right-[10%] w-1.5 h-1.5 bg-gradient-purple/45 rounded-full animate-sparkle" />
        <div className="absolute bottom-[30%] left-[15%] w-1 h-1 bg-rose-accent/30 rounded-full animate-sparkle" style={{ animationDelay: "1.3s" }} />
      </div>

      <div className="relative z-10 py-8 sm:py-12 px-4">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Header */}
          <div className="animate-fade-in">
            <Link
              href={`/event/${eventId}`}
              className="inline-flex items-center gap-1.5 text-sm text-warm-400 hover:text-warm-600 transition-colors mb-3"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Back
            </Link>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1
                  className="text-2xl sm:text-3xl font-bold text-warm-900 tracking-tight"
                  style={{ fontFamily: "'Poppins', sans-serif" }}
                >
                  Albums
                </h1>
                <p className="text-warm-500 mt-1">AI-generated wedding moment albums</p>
              </div>
              <Button
                onClick={handleGenerate}
                loading={generating}
                disabled={generating || albums.some((a) => a.status === "generating")}
              >
                <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
                Generate Album
              </Button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50/80 border border-red-100 rounded-2xl animate-fade-in">
              <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Album list */}
          {albums.length === 0 ? (
            <div className="text-center py-20 animate-fade-in">
              <div className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-warm-100 flex items-center justify-center">
                <svg className="w-10 h-10 text-warm-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <p className="text-warm-600 font-medium text-lg">No albums yet</p>
              <p className="text-sm text-warm-400 mt-2 max-w-sm mx-auto">
                Click &ldquo;Generate Album&rdquo; to let AI organize your wedding photos into beautiful moments
              </p>
            </div>
          ) : (
            <div className="space-y-4 animate-slide-up stagger-1">
              {albums.map((album) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  eventId={eventId}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AlbumCard({
  album,
  eventId,
  onDelete,
}: {
  album: Album;
  eventId: string;
  onDelete: (id: string) => void;
}) {
  const isReady = album.status === "completed";
  const isGenerating = album.status === "generating" || album.status === "pending";
  const isFailed = album.status === "failed";

  return (
    <div className="glass rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/70 hover:shadow-md">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {isReady ? (
              <Link
                href={`/event/${eventId}/albums/${album.id}`}
                className="group"
              >
                <h3 className="text-lg font-semibold text-warm-900 group-hover:text-gradient-purple transition-colors truncate">
                  {album.title}
                </h3>
              </Link>
            ) : (
              <h3 className="text-lg font-semibold text-warm-900 truncate">
                {isGenerating ? "Generating album..." : album.title}
              </h3>
            )}

            {album.summary && (
              <p className="text-sm text-warm-500 mt-1.5 line-clamp-2">
                {album.summary}
              </p>
            )}

            <div className="flex items-center gap-3 mt-3">
              {/* Status badge */}
              {isGenerating && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-purple/10 text-gradient-purple text-xs font-semibold rounded-full">
                  <div className="w-1.5 h-1.5 rounded-full bg-gradient-purple animate-pulse" />
                  Generating
                </span>
              )}
              {isFailed && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-600 text-xs font-semibold rounded-full">
                  Failed
                </span>
              )}
              {isReady && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sage/10 text-sage text-xs font-semibold rounded-full">
                  {album.moment_count} moment{album.moment_count !== 1 ? "s" : ""}
                </span>
              )}
              <span className="text-xs text-warm-400">
                {formatDate(album.created_at)}
              </span>
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            {isReady && (
              <Link href={`/event/${eventId}/albums/${album.id}`}>
                <Button variant="primary" size="sm">
                  View
                </Button>
              </Link>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(album.id)}
            >
              <svg className="w-4 h-4 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </Button>
          </div>
        </div>
      </div>

      {/* Generating progress bar */}
      {isGenerating && (
        <div className="h-1 bg-warm-100">
          <div
            className="h-full bg-gradient-to-r from-gradient-purple to-gradient-pink rounded-full"
            style={{
              width: "60%",
              animation: "shimmer 2s ease-in-out infinite",
            }}
          />
        </div>
      )}
    </div>
  );
}
