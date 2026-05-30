import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ── Push a conversation backup to Convex ──────────────────────────────────────
export const pushConversation = mutation({
  args: {
    device_id: v.string(),
    conversation_id: v.string(),
    encrypted_title: v.string(),
    encrypted_model_id: v.optional(v.string()),
    message_count: v.number(),
    token_count: v.number(),
    is_archived: v.boolean(),
    is_starred: v.boolean(),
    sync_version: v.number(),
    created_at: v.number(),
    updated_at: v.number(),
    owner_token: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("conversation_backups")
      .withIndex("by_device_conversation", (q) =>
        q.eq("device_id", args.device_id).eq("conversation_id", args.conversation_id)
      )
      .first();

    if (existing) {
      if (args.sync_version < existing.sync_version) {
        throw new Error(`CONFLICT: Local version ${args.sync_version} < server version ${existing.sync_version}`);
      }
      return await ctx.db.patch(existing._id, {
        ...args,
        sync_version: existing.sync_version + 1,
      });
    }

    return await ctx.db.insert("conversation_backups", args);
  },
});

// ── Pull conversations for a device ──────────────────────────────────────────
export const pullConversations = query({
  args: {
    owner_token: v.string(),
    since_timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("conversation_backups")
      .withIndex("by_owner_updated", (q) => q.eq("owner_token", args.owner_token));

    const results = await q.collect();

    if (args.since_timestamp) {
      return results.filter((r) => r.updated_at > args.since_timestamp!);
    }
    return results;
  },
});

// ── Delete a conversation backup ──────────────────────────────────────────────
export const deleteConversation = mutation({
  args: {
    device_id: v.string(),
    conversation_id: v.string(),
    owner_token: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("conversation_backups")
      .withIndex("by_device_conversation", (q) =>
        q.eq("device_id", args.device_id).eq("conversation_id", args.conversation_id)
      )
      .first();

    if (!existing) return null;
    if (existing.owner_token !== args.owner_token) {
      throw new Error("FORBIDDEN: owner_token mismatch");
    }

    const messages = await ctx.db
      .query("message_backups")
      .withIndex("by_conversation", (q) => q.eq("conversation_id", args.conversation_id))
      .collect();

    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    return await ctx.db.delete(existing._id);
  },
});
