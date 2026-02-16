function getBackendUrl(): string {
  if (typeof window === "undefined") {
    return (
      process.env.INTERNAL_API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:3501"
    );
  }
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    `${window.location.protocol}//${window.location.hostname}:3501`
  );
}

function getWsUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:3501/ws";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host =
    process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, "") ??
    `${window.location.hostname}:3501`;
  return `${protocol}//${host}/ws`;
}

export const BACKEND_URL = getBackendUrl();
export const WS_URL = getWsUrl();
