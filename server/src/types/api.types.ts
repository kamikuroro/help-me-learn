// Request types
export interface IngestRequest {
  url: string;
  tags?: string[];
}

export interface ChatRequest {
  message: string;
  source_id?: number;
  conversation_id?: number;
  tts?: boolean;
}

export interface SearchRequest {
  q: string;
  limit?: number;
  category?: string;
}

export interface GenerateAudioRequest {
  type: 'full' | 'summary';
}

export interface GenerateArtifactRequest {
  type: 'claude_md' | 'cursorrules' | 'skill_md' | 'mcp_config';
  topic: string;
  source_filter?: string;
}

// Response types
export interface SourceResponse {
  id: number;
  url: string;
  title: string | null;
  summary: string | null;
  category: string | null;
  tags: string[];
  status: string;
  error_message: string | null;
  word_count: number | null;
  audio_full_path: string | null;
  audio_full_duration_s: number | null;
  audio_summary_path: string | null;
  audio_summary_duration_s: number | null;
  created_at: string;
  updated_at: string;
}

export interface SourceDetailResponse extends SourceResponse {
  raw_content: string | null;
}

export interface IngestResponse {
  id: number;
  status: string;
  message: string;
}

export interface StatusResponse {
  id: number;
  status: string;
  error_message: string | null;
}

export interface SearchResult {
  source_id: number;
  title: string;
  url: string;
  excerpt: string;
  relevance: number;
  category: string | null;
}

export interface ChatResponse {
  message_id: number;
  conversation_id: number;
  content: string;
  audio_url: string | null;
  sources_referenced: { id: number; title: string; url: string }[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
}
