import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Z-AI Chatbot — Convex Cloud Sync Schema
 *
 * This schema mirrors the local SQLCipher schema but stores only
 * ENCRYPTED blobs — Convex never sees plaintext conversation content.
 * The encryption key is derived from the user's PIN and never transmitted.
 *
 * All content fields are AES-256-GCM encrypted on-device before upload.
 */
export default defineSchema({
  // ── Sync Devices ─────────────────────────────────────────────────────────
  sync_devices: defineTable({
    device_id: v.string(),          // Local UUID
    device_name: v.string(),        // Human-readable name
    platform: v.union(
      v.literal("android"),
      v.literal("desktop")
    ),
    public_key_hex: v.string(),     // Ed25519 public key for handshake
    last_seen_at: v.number(),       // Unix timestamp
    is_trusted: v.boolean(),
    owner_token: v.string(),        // Opaque owner identifier (hashed)
  })
    .index("by_device_id", ["device_id"])
    .index("by_owner", ["owner_token"]),

  // ── Encrypted Conversation Backups ────────────────────────────────────────
  conversation_backups: defineTable({
    device_id: v.string(),
    conversation_id: v.string(),    // Local SQLite UUID
    encrypted_title: v.string(),    // AES-256-GCM encrypted
    encrypted_model_id: v.optional(v.string()),
    message_count: v.number(),
    token_count: v.number(),
    is_archived: v.boolean(),
    is_starred: v.boolean(),
    sync_version: v.number(),       // Optimistic concurrency control
    created_at: v.number(),         // Unix timestamp
    updated_at: v.number(),
    owner_token: v.string(),
  })
    .index("by_device_conversation", ["device_id", "conversation_id"])
    .index("by_owner_updated", ["owner_token", "updated_at"])
    .index("by_owner", ["owner_token"]),

  // ── Encrypted Message Backups ─────────────────────────────────────────────
  message_backups: defineTable({
    device_id: v.string(),
    message_id: v.string(),         // Local SQLite UUID
    conversation_id: v.string(),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    encrypted_content: v.string(),  // AES-256-GCM encrypted
    token_count: v.number(),
    is_error: v.boolean(),
    created_at: v.number(),
    owner_token: v.string(),
  })
    .index("by_conversation", ["conversation_id"])
    .index("by_device_message", ["device_id", "message_id"])
    .index("by_owner", ["owner_token"]),

  // ── Sync Audit Log ────────────────────────────────────────────────────────
  sync_events: defineTable({
    device_id: v.string(),
    event_type: v.union(
      v.literal("push"),
      v.literal("pull"),
      v.literal("conflict"),
      v.literal("error")
    ),
    items_affected: v.number(),
    owner_token: v.string(),
    timestamp: v.number(),
    error_message: v.optional(v.string()),
  })
    .index("by_owner_timestamp", ["owner_token", "timestamp"]),
});
