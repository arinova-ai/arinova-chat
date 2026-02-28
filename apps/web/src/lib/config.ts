function getBackendUrl(): string {
  if (typeof window === "undefined") {
    return (
      process.env.INTERNAL_API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:21001"
    );
  }
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    `${window.location.protocol}//${window.location.hostname}:21001`
  );
}

function getWsUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:21001/ws";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host =
    process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, "") ??
    `${window.location.hostname}:21001`;
  return `${protocol}//${host}/ws`;
}

export const BACKEND_URL = getBackendUrl();
export const WS_URL = getWsUrl();

/** Default avatar for agents without a custom one */
export const AGENT_DEFAULT_AVATAR = "/assets/branding/agent-default-avatar.png";

/** Resolve a URL that may be absolute (R2) or relative (/uploads/...) */
export function assetUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${BACKEND_URL}${url}`;
}
