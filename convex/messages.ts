import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const pushMessages = mutation({
  args: {
    messages: v.array(v.object({
      device_id: v.string(),
      message_id: v.string(),
      conversation_id: v.string(),
      role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
      encrypted_content: v.string(),
      token_count: v.number(),
      is_error: v.boolean(),
      created_at: v.number(),
      owner_token: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const msg of args.messages) {
      const existing = await ctx.db
        .query("message_backups")
        .withIndex("by_device_message", (q) =>
          q.eq("device_id", msg.device_id).eq("message_id", msg.message_id)
        )
        .first();

      if (!existing) {
        const id = await ctx.db.insert("message_backups", msg);
        results.push(id);
      }
    }
    return results;
  },
});

export const pullMessages = query({
  args: {
    conversation_id: v.string(),
    owner_token: v.string(),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("message_backups")
      .withIndex("by_conversation", (q) => q.eq("conversation_id", args.conversation_id))
      .collect();

    return messages.filter((m) => m.owner_token === args.owner_token);
  },
});
