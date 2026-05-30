import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const registerDevice = mutation({
  args: {
    device_id: v.string(),
    device_name: v.string(),
    platform: v.union(v.literal("android"), v.literal("desktop")),
    public_key_hex: v.string(),
    owner_token: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sync_devices")
      .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
      .first();

    if (existing) {
      return await ctx.db.patch(existing._id, {
        last_seen_at: Date.now(),
        device_name: args.device_name,
        public_key_hex: args.public_key_hex,
      });
    }

    return await ctx.db.insert("sync_devices", {
      ...args,
      last_seen_at: Date.now(),
      is_trusted: false,
    });
  },
});

export const getTrustedDevices = query({
  args: { owner_token: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sync_devices")
      .withIndex("by_owner", (q) => q.eq("owner_token", args.owner_token))
      .filter((q) => q.eq(q.field("is_trusted"), true))
      .collect();
  },
});

export const logSyncEvent = mutation({
  args: {
    device_id: v.string(),
    event_type: v.union(
      v.literal("push"),
      v.literal("pull"),
      v.literal("conflict"),
      v.literal("error")
    ),
    items_affected: v.number(),
    owner_token: v.string(),
    error_message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sync_events", {
      ...args,
      timestamp: Date.now(),
    });
  },
});
