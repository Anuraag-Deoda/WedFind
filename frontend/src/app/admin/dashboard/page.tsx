"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Toast, useToast } from "@/components/ui/Toast";
import { listEvents, createEvent, deleteEvent } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Event } from "@/types";

export default function AdminDashboard() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [creating, setCreating] = useState(false);
  const { toast, showToast, clearToast } = useToast();

  const loadEvents = useCallback(async () => {
    try {
      const data = await listEvents();
      setEvents(data);
    } catch {
      showToast("Failed to load events", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setCreating(true);
    try {
      await createEvent(newName.trim(), newCode.trim() || undefined);
      setNewName("");
      setNewCode("");
      setShowCreate(false);
      showToast("Event created!", "success");
      loadEvents();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create event", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (eventId: string, eventName: string) => {
    if (!confirm(`Delete "${eventName}" and all its photos? This cannot be undone.`)) return;

    try {
      await deleteEvent(eventId);
      showToast("Event deleted", "success");
      loadEvents();
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

  return (
    <div className="min-h-screen py-12 px-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-48 -right-48 w-[550px] h-[550px] bg-gradient-pink/18 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] bg-gradient-purple/8 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 right-1/4 w-[300px] h-[300px] bg-gradient-blue/6 rounded-full blur-[100px]" />
        <div className="absolute top-[15%] right-[12%] w-1.5 h-1.5 bg-gradient-purple/40 rounded-full animate-sparkle" />
      </div>
      <div className="max-w-4xl mx-auto space-y-8 relative z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-warm-900" style={{ fontFamily: "'Poppins', sans-serif" }}>Admin Dashboard</h1>
          <Button onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? "Cancel" : "Create Event"}
          </Button>
        </div>

        {showCreate && (
          <form
            onSubmit={handleCreate}
            className="p-6 glass rounded-2xl space-y-4"
          >
            <Input
              id="event-name"
              label="Event Name"
              placeholder="e.g. Sarah and John's Wedding"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              id="access-code"
              label="Access Code (optional, auto-generated if empty)"
              placeholder="e.g. SARAHJOHN"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            />
            <Button type="submit" loading={creating} disabled={!newName.trim()}>
              Create Event
            </Button>
          </form>
        )}

        {events.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-warm-500">No events yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between p-5 glass rounded-2xl transition-all duration-300 hover:bg-white/70 hover:shadow-md"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/event/${event.id}`}
                    className="font-medium text-warm-900 hover:text-warm-700"
                  >
                    {event.name}
                  </Link>
                  <div className="flex gap-4 mt-1 text-sm text-warm-500">
                    <span className="font-mono">{event.access_code}</span>
                    <span>{formatDate(event.created_at)}</span>
                    {!event.is_active && (
                      <span className="text-red-500">Inactive</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 ml-4">
                  <Link href={`/admin/event/${event.id}`}>
                    <Button variant="ghost" size="sm">
                      Manage
                    </Button>
                  </Link>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(event.id, event.name)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={clearToast} />
      )}
    </div>
  );
}
