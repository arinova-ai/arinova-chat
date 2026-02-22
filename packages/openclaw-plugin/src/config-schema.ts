import { DmPolicySchema, requireOpenAllowFrom } from "openclaw/plugin-sdk";
import { z } from "zod";

export const ArinovaChatAccountSchemaBase = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    apiUrl: z.string().optional(),
    botToken: z.string().optional(),
    email: z.string().optional(),
    password: z.string().optional(),
    sessionToken: z.string().optional(),
    agentId: z.string().uuid().optional(),
    dmPolicy: DmPolicySchema.optional().default("open"),
    allowFrom: z.array(z.string()).optional(),
    textChunkLimit: z.number().int().positive().optional(),
  })
  .strict();

export const ArinovaChatAccountSchema = ArinovaChatAccountSchemaBase.superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message:
      'channels.openclaw-arinova-ai.dmPolicy="open" requires channels.openclaw-arinova-ai.allowFrom to include "*"',
  });
});

export const ArinovaChatConfigSchema = ArinovaChatAccountSchemaBase.extend({
  accounts: z.record(z.string(), ArinovaChatAccountSchema.optional()).optional(),
}).superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message:
      'channels.openclaw-arinova-ai.dmPolicy="open" requires channels.openclaw-arinova-ai.allowFrom to include "*"',
  });
});
