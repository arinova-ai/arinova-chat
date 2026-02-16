## ADDED Requirements

### Requirement: Iframe sandbox configuration
On web, apps SHALL run in an `<iframe>` with `sandbox="allow-scripts"`. The `allow-same-origin`, `allow-top-navigation`, `allow-popups`, and `allow-forms` flags SHALL NOT be set.

#### Scenario: Script execution allowed
- **WHEN** an app contains JavaScript code
- **THEN** the script executes within the sandboxed iframe

#### Scenario: Same-origin access blocked
- **WHEN** app code attempts to access `parent.document` or `top.document`
- **THEN** the browser blocks the access due to sandbox restrictions

### Requirement: Content Security Policy
The platform SHALL inject a CSP header/meta for each app. Default CSP for apps without network permission: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'`. Apps with network permission: `connect-src` SHALL include only domains from `network.allowed`.

#### Scenario: No network permission
- **WHEN** an app without "network" permission attempts a fetch/XHR request
- **THEN** the request is blocked by CSP

#### Scenario: Whitelisted domain
- **WHEN** an app with `network.allowed: ["api.game.com"]` fetches from `api.game.com`
- **THEN** the request is allowed

#### Scenario: Non-whitelisted domain
- **WHEN** an app with network permission fetches from a domain not in `allowed`
- **THEN** the request is blocked by CSP

### Requirement: Static analysis scanning
The platform SHALL perform static analysis on uploaded packages. The scanner SHALL flag: `eval()`, `new Function()`, `import()` dynamic imports, `document.cookie` access, attempts to escape iframe (`top.location`, `parent.location`). Packages with flagged code SHALL be rejected with specific violation details.

#### Scenario: Code using eval
- **WHEN** a package contains `eval("code")`
- **THEN** the scanner rejects with "Forbidden API: eval()"

#### Scenario: Clean package
- **WHEN** a package contains no forbidden APIs
- **THEN** the scanner passes and the package proceeds to the next review stage

### Requirement: Mobile WebView sandbox
On iOS, apps SHALL run in `WKWebView` with `javaScriptEnabled: true`, `allowsLinkPreview: false`, `allowsInlineMediaPlayback: true`. On Android, apps SHALL run in `WebView` with `setJavaScriptEnabled(true)`, `setAllowFileAccess(false)`, `setAllowContentAccess(false)`.

#### Scenario: iOS app rendering
- **WHEN** the platform loads an app on iOS
- **THEN** the app renders in a WKWebView with restricted configuration

### Requirement: Package size limits
App packages SHALL have a maximum upload size of 50MB. The platform SHALL reject packages exceeding this limit.

#### Scenario: Oversized package
- **WHEN** a developer uploads a 60MB package
- **THEN** the upload is rejected with "Package exceeds 50MB limit"

### Requirement: Resource isolation
Each app instance SHALL run in its own iframe/WebView. Multiple app instances SHALL NOT share any state, storage, or communication channels.

#### Scenario: Two instances of same app
- **WHEN** two users run the same app simultaneously
- **THEN** each runs in a separate iframe with no shared state

### Requirement: Storage sandbox
Apps with "storage" permission SHALL have access to `localStorage` and `IndexedDB` within their sandboxed origin. Storage SHALL be scoped per app ID per user. Storage quota SHALL be limited to 10MB per app per user.

#### Scenario: Storage persistence
- **WHEN** an app with storage permission writes to localStorage and the user reopens the app later
- **THEN** the stored data is available

#### Scenario: Storage quota exceeded
- **WHEN** an app exceeds 10MB of storage
- **THEN** further writes fail with a QuotaExceededError
