const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeArinovaChatMessagingTarget(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  let normalized = trimmed;

  if (normalized.startsWith("arinova-chat:")) {
    normalized = normalized.slice("arinova-chat:".length).trim();
  } else if (normalized.startsWith("arinova:")) {
    normalized = normalized.slice("arinova:".length).trim();
  }

  if (!normalized) return undefined;

  return `arinova-chat:${normalized}`.toLowerCase();
}

export function looksLikeArinovaChatTargetId(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;

  if (/^(arinova-chat|arinova):/i.test(trimmed)) {
    return true;
  }

  return UUID_RE.test(trimmed);
}
