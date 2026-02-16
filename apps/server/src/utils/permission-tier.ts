// Permission tier classification for marketplace apps
// Tier 0: No permissions → auto-publish after scan
// Tier 1: storage, audio → auto-publish after scan
// Tier 2: network → requires manual review (whitelist inspection)

export type PermissionTier = 0 | 1 | 2;

const TIER_2_PERMISSIONS = ["network"];
const TIER_1_PERMISSIONS = ["storage", "audio"];

export function classifyPermissionTier(permissions: string[]): PermissionTier {
  if (permissions.some((p) => TIER_2_PERMISSIONS.includes(p))) {
    return 2;
  }
  if (permissions.some((p) => TIER_1_PERMISSIONS.includes(p))) {
    return 1;
  }
  return 0;
}

export function requiresManualReview(tier: PermissionTier): boolean {
  return tier >= 2;
}
