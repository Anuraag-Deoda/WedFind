const API_BASE = "/new-app/api";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(data.error || "Request failed", res.status);
  }

  return res.json();
}

// Events
export async function lookupEvent(accessCode: string) {
  return request<{ event_id: string; event_name: string }>("/events/lookup", {
    method: "POST",
    body: JSON.stringify({ access_code: accessCode }),
  });
}

export async function getEvent(eventId: string) {
  return request<import("@/types").Event>(`/events/${eventId}`);
}

export async function getEventStats(eventId: string) {
  return request<import("@/types").EventStats>(`/events/${eventId}/stats`);
}

export async function getEventImages(eventId: string, page = 1, perPage = 50) {
  return request<import("@/types").PaginatedImages>(
    `/events/${eventId}/images?page=${page}&per_page=${perPage}`
  );
}

export async function createEvent(name: string, accessCode?: string) {
  return request<import("@/types").Event>("/events", {
    method: "POST",
    body: JSON.stringify({ name, access_code: accessCode }),
  });
}

export async function deleteEvent(eventId: string) {
  return request<{ message: string }>(`/events/${eventId}`, {
    method: "DELETE",
  });
}

export async function listEvents() {
  return request<import("@/types").Event[]>("/events");
}

// Upload (single file with XHR progress)
export function uploadSingleImage(
  eventId: string,
  file: File,
  consent: boolean,
  onProgress?: (loaded: number, total: number) => void
): { promise: Promise<import("@/types").UploadResponse>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append("event_id", eventId);
  formData.append("consent", consent.toString());
  formData.append("images", file);

  const promise = new Promise<import("@/types").UploadResponse>(
    (resolve, reject) => {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(e.loaded, e.total);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            reject(new ApiError(data.error || "Upload failed", xhr.status));
          } catch {
            reject(new ApiError("Upload failed", xhr.status));
          }
        }
      };
      xhr.onerror = () => reject(new ApiError("Network error", 0));
      xhr.onabort = () => reject(new ApiError("Upload cancelled", 0));
      xhr.open("POST", `${API_BASE}/upload`);
      xhr.send(formData);
    }
  );

  return { promise, abort: () => xhr.abort() };
}

// Upload (batch — kept for backward compat)
export async function uploadImages(
  eventId: string,
  files: File[],
  consent: boolean
) {
  const formData = new FormData();
  formData.append("event_id", eventId);
  formData.append("consent", consent.toString());
  files.forEach((file) => formData.append("images", file));

  return request<import("@/types").UploadResponse>("/upload", {
    method: "POST",
    body: formData,
  });
}

// Jobs
export async function getJobStatus(jobId: string) {
  return request<import("@/types").ProcessingJob>(`/jobs/${jobId}`);
}

// Search
export async function searchFaces(
  eventId: string,
  selfie: Blob,
  threshold?: number,
  excludedImageIds?: string[]
) {
  const formData = new FormData();
  formData.append("event_id", eventId);
  formData.append("selfie", selfie, "selfie.jpg");
  if (threshold !== undefined) {
    formData.append("threshold", threshold.toString());
  }
  if (excludedImageIds && excludedImageIds.length > 0) {
    formData.append("excluded_image_ids", excludedImageIds.join(","));
  }

  return request<import("@/types").SearchResponse>("/search", {
    method: "POST",
    body: formData,
  });
}

// Search feedback
export async function submitSearchFeedback(
  eventId: string,
  imageId: string,
  selfieHash: string
) {
  return request<{
    status: string;
    image_id: string;
    feedback_stats: import("@/types").FeedbackStats;
  }>("/search/feedback", {
    method: "POST",
    body: JSON.stringify({
      event_id: eventId,
      image_id: imageId,
      selfie_hash: selfieHash,
    }),
  });
}

// Smart Search
export async function smartSearch(
  eventId: string,
  options: {
    query?: string;
    selfie?: Blob;
    threshold?: number;
    excludedImageIds?: string[];
    maxResults?: number;
  }
) {
  const formData = new FormData();
  formData.append("event_id", eventId);
  if (options.query) {
    formData.append("query", options.query);
  }
  if (options.selfie) {
    formData.append("selfie", options.selfie, "selfie.jpg");
  }
  if (options.threshold !== undefined) {
    formData.append("threshold", options.threshold.toString());
  }
  if (options.excludedImageIds && options.excludedImageIds.length > 0) {
    formData.append("excluded_image_ids", options.excludedImageIds.join(","));
  }
  if (options.maxResults !== undefined) {
    formData.append("max_results", options.maxResults.toString());
  }

  return request<import("@/types").SmartSearchResponse>("/search/smart", {
    method: "POST",
    body: formData,
  });
}

// Albums
export async function generateAlbum(eventId: string) {
  return request<{ album_id: string; status: string; message: string }>(
    `/events/${eventId}/albums/generate`,
    { method: "POST" }
  );
}

export async function listAlbums(eventId: string) {
  return request<{ albums: import("@/types").Album[]; count: number }>(
    `/events/${eventId}/albums`
  );
}

export async function getAlbum(eventId: string, albumId: string) {
  return request<import("@/types").Album>(
    `/events/${eventId}/albums/${albumId}`
  );
}

export async function deleteAlbum(eventId: string, albumId: string) {
  return request<{ message: string }>(
    `/events/${eventId}/albums/${albumId}`,
    { method: "DELETE" }
  );
}

// Images
export function getImageUrl(eventId: string, filename: string) {
  return `${API_BASE}/events/${eventId}/file/${filename}`;
}

export function getThumbnailUrl(eventId: string, filename: string) {
  return `${API_BASE}/events/${eventId}/thumbnail/${filename}`;
}
