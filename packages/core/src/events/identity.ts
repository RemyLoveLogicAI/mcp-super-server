/**
 * Identity mesh events.
 * Whitepaper §6: Cross-Platform Identity Mesh (Innovation #4)
 */

import { z } from "../schemas/zod";
import { CoreEventBase } from "./base.js";

export const IdentityLinked = CoreEventBase.extend({
  event_type: z.literal("identity.linked"),
  canonical_user_id: z.string(),
  platform: z.string(),
  platform_identity_id: z.string(),
  proof: z.record(z.string(), z.any()).optional(),
  initiated_by: z.enum(["user", "agent", "system"]).optional()
});

export type IdentityLinked = z.infer<typeof IdentityLinked>;

export const IdentityUnlinked = CoreEventBase.extend({
  event_type: z.literal("identity.unlinked"),
  canonical_user_id: z.string(),
  platform: z.string(),
  platform_identity_id: z.string(),
  reason: z.string().optional(),
  initiated_by: z.enum(["user", "agent", "system", "admin"]).optional()
});

export type IdentityUnlinked = z.infer<typeof IdentityUnlinked>;

export const IdentityEvents = {
  IdentityLinked,
  IdentityUnlinked
} as const;
