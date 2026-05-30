/**
 * Z-AI Chatbot — Shared Domain Types
 * Single source of truth for all data shapes used across screens, stores, and services.
 * Mirrors the backend ORM models exactly — changes here must sync with models.py.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthStatus {
  is_unlocked: boolean;
  is_first_launch: boolean;
  device_id: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
  device_id: string;
}

export interface SessionState {
  token: string | null;
  deviceId: string | null;
  isUnlocked: boolean;
  isFirstLaunch: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversations
// ─────────────────────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  title: string;
  model_id: string | null;
  is_archived: boolean;
  is_starred: boolean;
  system_prompt: string | null;
  message_count: number;
  token_count: number;
  created_at: string; // ISO 8601 UTC
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Messages
// ─────────────────────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  token_count: number;
  is_error: boolean;
  tool_name: string | null;
  tool_args: string | null;
  created_at: string;
}

/**
 * A message that is currently being streamed from the model.
 * Exists only in the Zustand store — never persisted mid-stream.
 */
export interface StreamingMessage {
  id: string; // Temporary client-generated ID
  role: 'assistant';
  content: string; // Grows as tokens arrive
  isStreaming: true;
  startedAt: number; // Performance.now() timestamp
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Models
// ─────────────────────────────────────────────────────────────────────────────

export type ModelFamily = 'phi' | 'gemma' | 'mistral' | 'llama' | 'qwen' | 'custom';
export type ModelQuantization = 'Q4_K_M' | 'Q5_K_M' | 'Q6_K' | 'Q8_0' | 'F16' | string;

export interface AIModel {
  id: string;
  name: string;
  filename: string;
  family: ModelFamily;
  parameter_count: string;
  quantization: ModelQuantization;
  size_bytes: number;
  context_length: number;
  ram_required_mb: number;
  is_default: boolean;
  is_loaded: boolean;
  is_active: boolean;
  description: string | null;
  source_url: string | null;
  sha256_hash: string | null;
  installed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Telemetry
// ─────────────────────────────────────────────────────────────────────────────

export interface TelemetrySnapshot {
  cpu_percent: number;
  ram_percent: number;
  ram_used_mb: number;
  ram_total_mb: number;
  disk_used_gb: number;
  disk_total_gb: number;
  model_loaded: string | null;
  recorded_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Backups
// ─────────────────────────────────────────────────────────────────────────────

export type BackupType = 'auto' | 'manual' | 'pre_sync';

export interface Backup {
  id: string;
  filename: string;
  size_bytes: number;
  checksum_sha256: string;
  backup_type: BackupType;
  conversation_count: number;
  message_count: number;
  is_verified: boolean;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// LAN Sync
// ─────────────────────────────────────────────────────────────────────────────

export type DevicePlatform = 'android' | 'desktop';

export interface SyncDevice {
  id: string;
  device_id: string;
  device_name: string;
  platform: DevicePlatform;
  public_key_hex: string;
  last_seen_ip: string | null;
  last_sync_at: string | null;
  is_trusted: boolean;
  paired_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature Flags
// ─────────────────────────────────────────────────────────────────────────────

export interface FeatureFlag {
  flag_key: string;
  flag_value: unknown; // JSON-parsed value
  is_enabled: boolean;
  description: string | null;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Achievements
// ─────────────────────────────────────────────────────────────────────────────

export interface Achievement {
  id: string;
  achievement_key: string;
  title: string;
  description: string;
  icon: string;
  is_unlocked: boolean;
  unlocked_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Responses (generic wrappers)
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiError {
  detail: string;
  status_code: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation Types (react-navigation param list)
// ─────────────────────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Splash: undefined;
  Setup: undefined;
  Unlock: undefined;
  Main: undefined; // Drawer navigator
};

export type MainDrawerParamList = {
  ChatHome: { conversationId?: string } | undefined;
  Dashboard: undefined;
  Models: undefined;
  Sync: undefined;
  Backup: undefined;
  Upgrade: undefined;
  // Settings: undefined; — re-add when SettingsScreen.tsx is implemented
};
