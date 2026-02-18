## 1. Push Infrastructure — Backend

- [x] 1.1 Install `web-push` package in server
- [x] 1.2 Add VAPID key environment variables (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) to `.env.production.example`
- [x] 1.3 Create push service module (initialize web-push with VAPID keys, send notification helper)
- [x] 1.4 Create `push_subscriptions` table (id, userId, endpoint, p256dh, auth, deviceInfo, createdAt)
- [x] 1.5 Create `notification_preferences` table (id, userId, globalEnabled, messageEnabled, playgroundInviteEnabled, playgroundTurnEnabled, playgroundResultEnabled, quietHoursStart, quietHoursEnd)
- [x] 1.6 Run Drizzle migrations
- [x] 1.7 Create `POST /api/push/subscribe` endpoint — store push subscription
- [x] 1.8 Create `DELETE /api/push/subscribe` endpoint — remove subscription
- [x] 1.9 Create `GET /api/push/vapid-key` endpoint — return public VAPID key
- [x] 1.10 Implement expired subscription cleanup (auto-delete on 410 Gone response)

## 2. Push Infrastructure — Frontend

- [x] 2.1 Create Service Worker (`public/sw.js`) with push event handler and notification click handler
- [x] 2.2 Register Service Worker on app load
- [x] 2.3 Implement push subscription flow (request permission → subscribe → POST to server)
- [x] 2.4 Implement notification click navigation (open app → navigate to conversation/playground)
- [x] 2.5 Handle subscription refresh on page load (re-subscribe if subscription changed)

## 3. Notification Triggers

- [x] 3.1 Implement online/offline detection (check active WebSocket connections per user)
- [x] 3.2 Add push trigger in message handler — send push when agent replies and user is offline
- [ ] 3.3 Add push trigger in group message handler — send push for group conversation replies
- [ ] 3.4 Add push trigger for playground invitation
- [ ] 3.5 Add push trigger for playground turn notification
- [ ] 3.6 Add push trigger for playground session result
- [ ] 3.7 Implement notification deduplication (suppress same-type within configurable window)
- [x] 3.8 Implement quiet hours check before sending

## 4. Notification Preferences

- [x] 4.1 Create `GET /api/notifications/preferences` endpoint
- [x] 4.2 Create `PUT /api/notifications/preferences` endpoint
- [ ] 4.3 Initialize default preferences on first push subscription (all enabled, no quiet hours)
- [x] 4.4 Integrate preference checks into push trigger logic (check per-type toggle + global toggle)

## 5. Notification UI — Permission Flow

- [ ] 5.1 Build notification permission prompt component (non-intrusive banner with Enable/Later)
- [ ] 5.2 Show prompt after first successful login (with 3-day reminder if "Later")
- [ ] 5.3 Build iOS Home Screen guidance banner (detect standalone mode, show step-by-step instructions)

## 6. Notification UI — Settings

- [ ] 6.1 Add notification section to settings page
- [ ] 6.2 Build per-type notification toggles
- [ ] 6.3 Build quiet hours picker (start/end time)
- [ ] 6.4 Build global notification toggle
- [ ] 6.5 Connect settings UI to preferences API

## 7. Shared Types

- [x] 7.1 Define PushSubscription, NotificationPreference, NotificationType types in `packages/shared/src/types/`
- [x] 7.2 Create Zod schemas for push subscription and notification preferences
