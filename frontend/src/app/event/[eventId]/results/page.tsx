"use client";

import { useParams } from "next/navigation";
import Link from "next/link";

export default function ResultsPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <p className="text-warm-500">
          Search results are shown on the Find page after taking a selfie.
        </p>
        <Link
          href={`/event/${eventId}/find`}
          className="inline-block text-gradient-purple underline hover:text-warm-800"
        >
          Go to Find My Photos
        </Link>
      </div>
    </div>
  );
}
