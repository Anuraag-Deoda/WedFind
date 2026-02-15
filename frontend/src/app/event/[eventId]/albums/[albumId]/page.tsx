"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Spinner } from "@/components/ui/Spinner";
import { ImagePreview } from "@/components/gallery/ImagePreview";
import { getAlbum } from "@/lib/api";
import type { Album, ImageRecord } from "@/types";

export default function AlbumDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const albumId = params.albumId as string;
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState<ImageRecord | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getAlbum(eventId, albumId);
        setAlbum(data);
      } catch {
        router.push(`/event/${eventId}/albums`);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [eventId, albumId, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!album || !album.moments) return null;

  const moments = album.moments;

  // Flatten all images for preview navigation
  const allImages: ImageRecord[] = moments.flatMap(
    (m) => m.photos?.map((p) => p.image).filter(Boolean) as ImageRecord[] ?? []
  );
  const currentIdx = previewImage
    ? allImages.findIndex((img) => img.id === previewImage.id)
    : -1;

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-48 -right-48 w-[600px] h-[600px] bg-gradient-pink/22 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-gradient-blue/12 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/3 w-[400px] h-[400px] bg-gradient-purple/8 rounded-full blur-[100px]" />
        <div className="absolute top-[12%] right-[15%] w-1.5 h-1.5 bg-gradient-purple/45 rounded-full animate-sparkle" />
        <div className="absolute bottom-[25%] left-[10%] w-1 h-1 bg-rose-accent/30 rounded-full animate-sparkle" style={{ animationDelay: "1.2s" }} />
        <div className="absolute top-[45%] right-[8%] w-1 h-1 bg-sage/40 rounded-full animate-sparkle" style={{ animationDelay: "0.8s" }} />
      </div>

      <div className="relative z-10 py-8 sm:py-12 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Back link */}
          <Link
            href={`/event/${eventId}/albums`}
            className="inline-flex items-center gap-1.5 text-sm text-warm-400 hover:text-warm-600 transition-colors mb-6"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            All Albums
          </Link>

          {/* Album header */}
          <div className="text-center mb-12 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 glass rounded-full text-xs font-semibold text-warm-500 uppercase tracking-wider mb-5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              AI-Generated Album
            </div>
            <h1
              className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight gradient-text leading-tight"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              {album.title}
            </h1>
            {album.summary && (
              <p className="text-warm-500 mt-4 max-w-2xl mx-auto text-base sm:text-lg leading-relaxed">
                {album.summary}
              </p>
            )}
            <div className="flex items-center justify-center gap-3 mt-5">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 glass rounded-full text-sm text-warm-600 font-medium">
                {moments.length} moment{moments.length !== 1 ? "s" : ""}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 glass rounded-full text-sm text-warm-600 font-medium">
                {allImages.length} photo{allImages.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Moments timeline */}
          <div className="space-y-16">
            {moments.map((moment, idx) => {
              const momentImages = moment.photos
                ?.map((p) => p.image)
                .filter(Boolean) as ImageRecord[] ?? [];

              return (
                <section
                  key={moment.id}
                  className="animate-slide-up"
                  style={{ animationDelay: `${idx * 0.1}s`, opacity: 0 }}
                >
                  {/* Moment header */}
                  <div className="flex items-start gap-4 mb-5">
                    {/* Timeline connector */}
                    <div className="flex flex-col items-center shrink-0 pt-1">
                      <div className="w-3 h-3 rounded-full bg-gradient-to-br from-gradient-purple to-gradient-pink shadow-sm shadow-gradient-purple/30" />
                      {idx < moments.length - 1 && (
                        <div className="w-px flex-1 bg-gradient-to-b from-warm-300/50 to-transparent min-h-[40px] mt-1" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2
                        className="text-xl sm:text-2xl font-bold text-warm-900 tracking-tight"
                        style={{ fontFamily: "'Poppins', sans-serif" }}
                      >
                        {moment.caption}
                      </h2>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {moment.time_start && (
                          <span className="text-xs text-warm-400 font-medium">
                            {new Date(moment.time_start).toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true,
                            })}
                            {moment.time_end && moment.time_end !== moment.time_start && (
                              <>
                                {" "}&ndash;{" "}
                                {new Date(moment.time_end).toLocaleTimeString("en-US", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                  hour12: true,
                                })}
                              </>
                            )}
                          </span>
                        )}
                        {moment.dominant_scene && (
                          <span className="px-2 py-0.5 bg-gradient-purple/8 text-gradient-purple text-[10px] font-semibold rounded-full uppercase tracking-wide">
                            {moment.dominant_scene.replace("_", " ")}
                          </span>
                        )}
                        {moment.mood && (
                          <span className="px-2 py-0.5 bg-rose-accent/8 text-rose-accent text-[10px] font-semibold rounded-full uppercase tracking-wide">
                            {moment.mood}
                          </span>
                        )}
                        {moment.lighting && (
                          <span className="px-2 py-0.5 bg-gold/8 text-warm-600 text-[10px] font-semibold rounded-full uppercase tracking-wide">
                            {moment.lighting.replace("_", " ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Moment photo grid */}
                  <div className="pl-7">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                      {momentImages.map((image) => (
                        <MomentGridItem
                          key={image.id}
                          image={image}
                          eventId={eventId}
                          onClick={() => setPreviewImage(image)}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>

          {/* Footer */}
          <div className="text-center mt-16 pb-8">
            <p className="text-xs text-warm-300/70 tracking-wide">
              Generated by WedFind AI
            </p>
          </div>
        </div>
      </div>

      <ImagePreview
        image={previewImage}
        eventId={eventId}
        onClose={() => setPreviewImage(null)}
        onPrev={
          currentIdx > 0
            ? () => setPreviewImage(allImages[currentIdx - 1])
            : undefined
        }
        onNext={
          currentIdx < allImages.length - 1
            ? () => setPreviewImage(allImages[currentIdx + 1])
            : undefined
        }
        hasPrev={currentIdx > 0}
        hasNext={currentIdx < allImages.length - 1}
      />
    </div>
  );
}

function MomentGridItem({
  image,
  eventId,
  onClick,
}: {
  image: ImageRecord;
  eventId: string;
  onClick: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const thumbnailUrl = image.thumbnail_filename
    ? `/new-app/api/events/${eventId}/thumbnail/${image.thumbnail_filename}`
    : `/new-app/api/events/${eventId}/file/${image.stored_filename}`;

  return (
    <div
      className="relative group aspect-square rounded-2xl overflow-hidden bg-warm-100 cursor-pointer shadow-sm hover:shadow-lg transition-all duration-300"
      onClick={onClick}
    >
      {!loaded && (
        <div className="absolute inset-0 bg-gradient-to-br from-warm-100 to-warm-200 shimmer-bg" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbnailUrl}
        alt={image.original_filename}
        className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-[1.06] ${loaded ? "opacity-100" : "opacity-0"}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </div>
  );
}
