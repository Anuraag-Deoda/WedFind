export interface Event {
  id: string;
  name: string;
  access_code: string;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
}

export interface ImageRecord {
  id: string;
  event_id: string;
  original_filename: string;
  stored_filename: string;
  thumbnail_filename: string | null;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  face_count: number;
  is_processed: boolean;
  uploaded_at: string;
}

export interface ProcessingJob {
  id: string;
  event_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  total_images: number;
  processed_images: number;
  failed_images: number;
  total_faces_found: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface MatchDetails {
  vector_similarity: number;
  bm25_score: number;
  quality_boost: number;
  feedback_penalty: number;
  face_quality: number | null;
  is_frontal: boolean | null;
  prominence: number | null;
  scene_type: string | null;
}

export interface FeedbackStats {
  personal_feedback_count: number;
  total_feedback_count: number;
}

export interface SearchResult {
  image: ImageRecord;
  similarity: number;
  match_details?: MatchDetails;
}

export interface SearchResponse {
  results: SearchResult[];
  count: number;
  threshold: number;
  selfie_hash: string;
  feedback_applied: boolean;
  feedback_stats: FeedbackStats;
}

export interface EventStats {
  event_id: string;
  event_name: string;
  image_count: number;
  face_count: number;
  processed_count: number;
  storage_used_bytes: number;
}

export interface PaginatedImages {
  images: ImageRecord[];
  total: number;
  page: number;
  pages: number;
  has_next: boolean;
}

export interface UploadResponse {
  job_id: string;
  images_accepted: number;
  images_rejected: number;
  duplicates_skipped: number;
}
