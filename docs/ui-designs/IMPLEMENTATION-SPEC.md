# UI Refresh Implementation Spec

## Branch
```
git checkout jiumi && git pull origin jiumi
git checkout -b feature/ui-refresh-batch1
```

## Batch 1 — 5 Pages

### Design Files
All approved designs: `docs/ui-designs/batch1-approved/`

---

### 1. Login Page (`ui-login.png`)
**File**: `apps/web/app/(auth)/login/page.tsx` (or equivalent auth route)

**Layout**: Split 50/50
- **Left panel**: Brand showcase component (shared with register)
  - Dark navy gradient background
  - Arinova Chat logo (AI brain icon)
  - "Arinova Chat" title (white, large)
  - "Start Your AI Journey Today" subtitle (gray)
  - Decorative: 3D geometric shapes (cubes, spheres), network lines, circuit patterns
- **Right panel**: Login form card
  - "Welcome Back" heading
  - "Sign in to your account" subtitle
  - Email input with mail icon
  - Password input with lock icon + eye toggle
  - "Forgot password?" link (blue)
  - "Sign In" button (blue gradient, full width)
  - "or continue with" divider
  - Google + GitHub OAuth buttons (side by side)
  - "Don't have an account? Sign up" link
  - Terms of Service link

**Colors**:
- Background: `#0a0f1e` to `#141b2d` gradient
- Card: `#1a2035` with subtle border
- Primary button: `#2563eb` to `#3b82f6` gradient
- Text: white / `#94a3b8`
- Input bg: `#0f172a` with `#334155` border

---

### 2. Register Page (`ui-register.png`)
**File**: `apps/web/app/(auth)/register/page.tsx`

**Layout**: Same split as login, shared left panel
- **Right panel**: Register form
  - "Create Account" heading
  - "Join thousands of users" subtitle
  - Nickname/Display Name input (person icon)
  - Email input (mail icon)
  - Password input (lock icon + eye toggle)
  - Confirm Password input (checkmark icon)
  - "Create Account" button (blue gradient)
  - "or sign up with" divider
  - Google + GitHub OAuth
  - "Already have an account? Sign in" link
  - Terms of Service agreement text

---

### 3. Shared Brand Panel Component
**File**: `apps/web/components/auth/BrandPanel.tsx` (new)

Reusable component for left side of auth pages:
- Full height, dark navy background
- Centered content: logo + title + tagline
- CSS animated geometric shapes (optional, can be static SVG)
- Responsive: hidden on mobile, shown on md+ breakpoints

---

### 4. Main Chat Interface (`ui-chat-main.png`)
**File**: `apps/web/components/chat/` (multiple files)

**Layout**: 3 columns
1. **Icon Rail** (48px): Chat, Spaces, Apps, Market, Settings icons
   - Active state: blue highlight + label
   - Tooltips on hover
2. **Conversation List** (280px):
   - "Conversations" header + search
   - List items: avatar, name, last message preview, timestamp
   - Active conversation highlighted
3. **Chat Area** (remaining):
   - Top bar: agent name, status (Online badge), action buttons
   - Messages: user (right, blue-purple bubble) / AI (left, dark bubble with avatar)
   - AI messages support: markdown, code blocks with syntax highlighting, bullet lists
   - Bottom: input field with attachment button + send button (blue accent)

---

### 5. AI Streaming State (`ui-chat-streaming.png`)
**File**: Same chat components, conditional state

- AI response bubble shows typing cursor/blinking indicator
- Text appears incrementally (already implemented, just style update)
- "Stop generating" button (red/purple accent, centered below message)
- Input field disabled during streaming

---

### 6. Group Chat (`ui-chat-group.png`)
**File**: `apps/web/components/chat/GroupChat.tsx` + `MembersSidebar.tsx`

**Layout**: 4 columns (adds member sidebar)
- Same Icon Rail + Conversation List
- Chat area with:
  - Sender name label + avatar for each message
  - Color-coded name tags (Alice, Ron, Linda, etc.)
  - @mention highlighted in purple/blue
  - @mention autocomplete dropdown on typing `@`
- **Members sidebar** (250px right):
  - "Members" section: human members with online/offline dots
  - "AI Agents" section: bot members with bot badge
  - "Add Member" button at bottom

---

## Design System Tokens

```css
/* Colors */
--bg-primary: #0a0f1e;
--bg-secondary: #141b2d;
--bg-card: #1a2035;
--bg-input: #0f172a;
--border: #334155;
--text-primary: #ffffff;
--text-secondary: #94a3b8;
--accent-blue: #3b82f6;
--accent-purple: #8b5cf6;
--success: #22c55e;
--warning: #eab308;
--error: #ef4444;

/* Typography */
--font-display: 64px/72px;
--font-h1: 58px/60px;
--font-h2: 48px/36px;
--font-h3: 16px/22px;
--font-body: 14px/20px;
--font-caption: 12px/16px;

/* Spacing */
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
```

## Tailwind CSS v4 Notes
- Use CSS-first configuration (no tailwind.config.js)
- Define custom colors in `@theme` block
- Use `dark:` variant for dark mode (or set as default)

---

## Batch 2 — 4 Pages

### Branch
```
git checkout jiumi && git pull origin jiumi
git checkout -b feature/ui-refresh-batch2
```

### Design Files
All approved designs: `docs/ui-designs/batch2-approved/`

---

### 1. Spaces Page (`ui-spaces.png`)
**File**: `apps/web/src/app/office/page.tsx` + `apps/web/src/components/office/` (existing, refresh only)

**Layout**: Full page with icon rail on left
- **Header**: "Spaces" title + "Create Space" button (blue gradient)
- **Kanban-style board** with columns:
  - **Active** (green header): Currently active spaces/rooms
  - **Planning** (blue header): Upcoming or draft spaces
  - **Archived** (gray header): Completed/archived spaces
- **Space cards**: Each card shows:
  - Space name (bold)
  - Description (gray text, 2 lines max)
  - Member avatars (stacked, max 3 + "+N" overflow)
  - Status badge (Active/Draft/Archived)
  - Last activity timestamp
- **Empty state**: Illustration + "Create your first space" CTA
- Responsive: Cards stack vertically on mobile

**Key**: This is a visual refresh of the existing Office/Spaces page. Preserve existing functionality (plugin detection, install guide, office view). Add the kanban board as the default view when connected.

---

### 2. Apps Directory Page (`ui-apps.png`)
**File**: `apps/web/src/app/apps/page.tsx` + `apps/web/src/components/apps/app-directory-page.tsx` (existing, refresh only)

**Layout**: Grid layout with filtering
- **Header**: "App Directory" title + search bar (right-aligned)
- **Category tabs**: All | Games | Tools | Social | Strategy | Puzzle | Other
  - Active tab: blue underline + blue text
  - Inactive: gray text
- **App grid**: Responsive 1/2/3/4 columns (mobile/sm/md/lg)
  - **App card** (dark card bg):
    - App icon (48px, rounded)
    - App name (white, bold)
    - Category badge (small, colored)
    - Short description (gray, 2 lines)
    - Star rating (yellow stars)
    - "Install" button (blue outline) or "Installed" badge (green)
- **Featured section** (top): Large banner card for featured/promoted apps
- **Pagination**: Bottom, simple prev/next with page numbers

**Key**: Refresh the existing AppDirectoryPage component. Keep all existing logic (search, filtering, pagination). Update visual style to match navy theme.

---

### 3. Settings Page (`ui-settings.png`)
**File**: `apps/web/src/app/settings/page.tsx` (existing, refresh only — 635 lines)

**Layout**: Left sidebar + right content panel
- **Settings sidebar** (240px):
  - "Settings" header
  - Navigation sections:
    - **Account**: Profile, Security, Privacy
    - **App**: Notifications, Appearance, Language
    - **About**: Version info, Terms, Help
  - Active item: blue bg highlight
- **Content panel** (remaining):
  - **Profile section** (default view):
    - Large avatar with edit overlay (camera icon)
    - Display name field (editable)
    - Username field (read-only, with copy button)
    - Email field (read-only)
    - Bio/About textarea
    - "Save Changes" button (blue gradient)
  - **Notification section**:
    - Toggle switches for each notification type
    - Quiet hours with time pickers
    - Push notification management
  - **Appearance section**:
    - Theme selector (Dark/Light/System) — radio cards
    - Font size slider
    - Chat density (Compact/Comfortable/Spacious)
  - **Security section**:
    - Change password form
    - Two-factor authentication toggle
    - Active sessions list with "Sign out" per session

**Key**: Major visual overhaul of the existing settings page. Current implementation is a single long scrollable page — convert to sidebar + content panel pattern. Preserve all existing functionality (profile update, password change, blocked users, notifications, quiet hours).

---

### 4. Design System / Component Library Reference (`ui-design-system.png`)
**File**: No new page needed — this is a reference document

This design is a reference sheet showing the design system tokens in use:
- **Color palette**: All navy theme colors with hex codes and CSS variable names
- **Typography scale**: Font sizes, weights, line heights
- **Component showcase**: Button variants, input styles, card styles, badge variants
- **Spacing system**: Padding/margin scale
- **Border radius**: sm/md/lg/xl variants
- **Shadow system**: Elevation levels

**Action**: No implementation needed for this page. It serves as Ron's visual reference when implementing Batch 2. Save in `docs/ui-designs/batch2-approved/ui-design-system.png` (already done).

---

### Batch 2 Implementation Notes

1. **All pages already exist** — this is purely a visual refresh, not new features
2. **Preserve all existing functionality** — don't break working features while restyling
3. **Settings page is the biggest change** — converting from single-page scroll to sidebar+panel pattern
4. **Use existing shadcn/ui components** — Button, Input, Switch, Avatar, etc. are already available
5. **Follow Batch 1 patterns** — use the same design token variables already added to globals.css
6. **Build must pass** — `pnpm --filter web build` must succeed before pushing
7. **One NIT from Batch 1**: Remove unused `LayoutGrid` import from `mobile-bottom-nav.tsx` while you're at it
