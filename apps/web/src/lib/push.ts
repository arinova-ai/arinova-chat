import { api } from "./api";

/**
 * Fetch VAPID public key from server.
 */
async function getVapidKey(): Promise<string | null> {
  try {
    const { vapidPublicKey } = await api<{ vapidPublicKey: string }>(
      "/api/push/vapid-key",
      { silent: true },
    );
    return vapidPublicKey || null;
  } catch {
    return null;
  }
}

/**
 * Convert VAPID key from URL-safe base64 to Uint8Array for PushManager.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

/**
 * Subscribe to push notifications.
 * Requests permission, subscribes via PushManager, and sends subscription to server.
 * Returns true if successful.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const vapidKey = await getVapidKey();
  if (!vapidKey) return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  const json = subscription.toJSON();
  await api("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      },
      deviceInfo: navigator.userAgent.slice(0, 500),
    }),
  });

  return true;
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await api("/api/push/subscribe", {
    method: "DELETE",
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });

  await subscription.unsubscribe();
}

/**
 * Check current push subscription status.
 */
export async function getPushStatus(): Promise<{
  supported: boolean;
  permission: NotificationPermission | null;
  subscribed: boolean;
}> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { supported: false, permission: null, subscribed: false };
  }

  const permission = Notification.permission;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  return {
    supported: true,
    permission,
    subscribed: subscription !== null,
  };
}

/**
 * Refresh push subscription on page load.
 * Re-sends subscription to server in case keys changed.
 */
export async function refreshPushSubscription(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (Notification.permission !== "granted") return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const json = subscription.toJSON();
  await api("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      },
      deviceInfo: navigator.userAgent.slice(0, 500),
    }),
    silent: true,
  }).catch(() => {
    // Silently ignore — subscription refresh is best-effort
  });
}

/**
 * Set up notification click handler for in-app navigation.
 * Call once in your app root component.
 */
export function setupNotificationClickHandler(
  navigate: (url: string) => void,
): () => void {
  const handler = (event: MessageEvent) => {
    if (event.data?.type === "NOTIFICATION_CLICK" && event.data.url) {
      navigate(event.data.url);
    }
  };

  navigator.serviceWorker?.addEventListener("message", handler);
  return () => navigator.serviceWorker?.removeEventListener("message", handler);
}
