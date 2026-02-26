const BASE_URL = process.env.NEXT_PUBLIC_ARINOVA_API_URL || "http://localhost:21001";
const APP_ID = process.env.NEXT_PUBLIC_ARINOVA_APP_ID || "";

// Store auth state in memory (for demo, use localStorage in real app)
let currentAccessToken: string | null = null;
let currentUser: { id: string; name: string; email: string } | null = null;

export function getAccessToken() {
  if (currentAccessToken) return currentAccessToken;
  if (typeof window !== "undefined") {
    return localStorage.getItem("arinova_token");
  }
  return null;
}

export function getUser() {
  if (currentUser) return currentUser;
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("arinova_user");
    if (stored) return JSON.parse(stored);
  }
  return null;
}

export function setAuth(token: string, user: { id: string; name: string; email: string }) {
  currentAccessToken = token;
  currentUser = user;
  if (typeof window !== "undefined") {
    localStorage.setItem("arinova_token", token);
    localStorage.setItem("arinova_user", JSON.stringify(user));
  }
}

export function clearAuth() {
  currentAccessToken = null;
  currentUser = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("arinova_token");
    localStorage.removeItem("arinova_user");
  }
}

export function isLoggedIn(): boolean {
  return !!getAccessToken();
}

// Start OAuth flow - redirect to Arinova authorization page
export function startLogin() {
  const params = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: `${window.location.origin}/`,
    scope: "profile agents",
    response_type: "code",
  });
  window.location.href = `${BASE_URL}/oauth/authorize?${params.toString()}`;
}

// Handle OAuth callback - exchange code for token
export async function handleOAuthCallback(code: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        client_id: APP_ID,
        redirect_uri: `${window.location.origin}/`,
      }),
    });
    if (!res.ok) return false;
    const data = await res.json();

    // Fetch user profile
    const profileRes = await fetch(`${BASE_URL}/api/v1/user/profile`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (!profileRes.ok) return false;
    const profile = await profileRes.json();

    setAuth(data.access_token, profile);
    return true;
  } catch {
    return false;
  }
}

// Fetch user's agents
export async function fetchAgents(): Promise<Array<{ id: string; name: string; description: string | null; avatarUrl: string | null }>> {
  const token = getAccessToken();
  if (!token) return [];
  try {
    const res = await fetch(`${BASE_URL}/api/v1/user/agents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.agents ?? [];
  } catch {
    return [];
  }
}

// Fetch balance
export async function fetchBalance(): Promise<number> {
  const token = getAccessToken();
  if (!token) return 0;
  try {
    const res = await fetch(`${BASE_URL}/api/v1/economy/balance`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.balance ?? 0;
  } catch {
    return 0;
  }
}

export { BASE_URL };
