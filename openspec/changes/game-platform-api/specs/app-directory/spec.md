## ADDED Requirements

### Requirement: App listing page
The system SHALL provide an App 目錄頁面，用戶可瀏覽已上架的遊戲/應用，支援分類篩選和搜尋。

#### Scenario: User browses app directory
- **WHEN** user navigates to the app directory page
- **THEN** system displays a grid of published apps with name, icon, description, and category

#### Scenario: User filters by category
- **WHEN** user selects a category filter (e.g., "game", "social", "tool")
- **THEN** system displays only apps matching that category

#### Scenario: User searches apps
- **WHEN** user enters a search query
- **THEN** system displays apps matching the query by name or description

### Requirement: App detail and launch
The system SHALL provide an App 詳情頁，顯示應用資訊並提供「Play」按鈕跳轉到外部遊戲 URL。

#### Scenario: User views app detail
- **WHEN** user clicks on an app card
- **THEN** system displays the app's full description, screenshots, developer info, and a "Play" button

#### Scenario: User launches app
- **WHEN** user clicks the "Play" button
- **THEN** system opens the app's external URL in a new tab/window

### Requirement: Apps database table
The system SHALL store apps in an `apps` table with fields: id, developer_id, name, description, category, icon_url, external_url, status (draft/published/suspended), created_at, updated_at.

#### Scenario: App record created
- **WHEN** a developer submits a new app
- **THEN** system creates an apps record with status "draft"
