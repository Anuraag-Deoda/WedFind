"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Toast, useToast } from "@/components/ui/Toast";
import { getEvent, getEventStats, deleteEvent } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/utils";
import type { Event, EventStats } from "@/types";

export default function AdminEventPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const [event, setEvent] = useState<Event | null>(null);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast, showToast, clearToast } = useToast();

  const load = useCallback(async () => {
    try {
      const [eventData, statsData] = await Promise.all([
        getEvent(eventId),
        getEventStats(eventId),
      ]);
      setEvent(eventData);
      setStats(statsData);
    } catch {
      showToast("Failed to load event", "error");
    } finally {
      setLoading(false);
    }
  }, [eventId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!event) return;
    if (
      !confirm(
        `Delete "${event.name}" and ALL associated photos, faces, and data? This cannot be undone.`
      )
    )
      return;

    try {
      await deleteEvent(eventId);
      showToast("Event deleted", "success");
      router.push("/admin/dashboard");
    } catch {
      showToast("Failed to delete event", "error");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!event || !stats) return null;

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <Link
            href="/admin/dashboard"
            className="text-sm text-warm-500 hover:text-warm-700 mb-1 inline-block"
          >
            &larr; Back to dashboard
          </Link>
          <h1 className="text-2xl font-bold text-warm-900">{event.name}</h1>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Photos" value={stats.image_count} />
          <StatCard label="Faces Detected" value={stats.face_count} />
          <StatCard label="Processed" value={stats.processed_count} />
          <StatCard label="Storage" value={formatBytes(stats.storage_used_bytes)} />
        </div>

        <div className="p-6 bg-warm-50 rounded-xl border border-warm-100 space-y-3">
          <h2 className="font-medium text-warm-800">Event Details</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-warm-500">Access Code</span>
              <p className="font-mono text-lg text-warm-900">
                {event.access_code}
              </p>
            </div>
            <div>
              <span className="text-warm-500">Status</span>
              <p className={event.is_active ? "text-sage" : "text-red-500"}>
                {event.is_active ? "Active" : "Inactive"}
              </p>
            </div>
            <div>
              <span className="text-warm-500">Created</span>
              <p className="text-warm-700">{formatDate(event.created_at)}</p>
            </div>
            <div>
              <span className="text-warm-500">Expires</span>
              <p className="text-warm-700">
                {event.expires_at ? formatDate(event.expires_at) : "Never"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Link href={`/event/${eventId}/gallery`}>
            <Button variant="secondary">View Gallery</Button>
          </Link>
          <Button variant="danger" onClick={handleDelete}>
            Delete Event
          </Button>
        </div>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={clearToast} />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="p-4 bg-white rounded-xl border border-warm-100">
      <p className="text-sm text-warm-500">{label}</p>
      <p className="text-2xl font-bold text-warm-900 mt-1">{value}</p>
    </div>
  );
}
