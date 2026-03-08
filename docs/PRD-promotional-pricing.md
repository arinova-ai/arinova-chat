# 特價機制規劃書 — Arinova 數位商品促銷系統

## 1. 業界參考

### LINE（貼圖 / 主題）
- **限時特價**：定期「半價活動」，通常配合節日或新品上架
- **免費贈送**：品牌聯名貼圖，加好友即可免費下載（限時）
- **套裝優惠**：多組貼圖打包折扣價
- **首購優惠**：新用戶首次購買享折扣

### KakaoTalk（表情符號 / 主題）
- **訂閱制**：Emoticon Plus 月付 ₩6,900 無限用（長期訂閱有折扣）
- **每週新品**：固定週期上新，上架初期可能有折扣
- **PC/Web 特價**：網頁版購買比手機便宜（₩3,900 vs ₩6,900）
- **免費活動**：節慶或合作活動送免費貼圖

### Steam（遊戲 / DLC）
- **季節大促**：春夏秋冬四季特賣，全平台參與
- **每日/週特價**：Daily Deal, Weekend Deal
- **開發者自訂折扣**：開發者可隨時設定折扣（有冷卻期限制）
- **組合包折扣**：Bundle 打包價（已擁有部分自動減價）
- **限時閃購**：Flash Sale（已取消，但概念仍被廣泛使用）

### Apple App Store（IAP / 訂閱）
- **Introductory Offer**：新訂閱用戶免費試用或折扣
- **Promotional Offer**：針對現有/流失用戶的個人化折扣
- **Offer Code**：可分發的兌換碼（URL / App Store / App 內兌換）
- **Win-back Offer**：針對取消訂閱用戶的回歸優惠
- 每個訂閱最多 10 個活躍 offer，最多推廣 20 個 IAP

---

## 2. 適用 Arinova 的促銷類型

| 促銷類型 | 適用商品 | 說明 |
|---------|---------|------|
| **限時折扣** | 貼圖、主題、App | 指定時間區間內以折扣價販售 |
| **閃購 Flash Sale** | 全品類 | 短時間（幾小時~1天）大幅折扣 |
| **新品上架折扣** | 貼圖、主題、App | 上架首 N 天自動享折扣 |
| **節日/活動促銷** | 全品類 | 聖誕、新年、週年慶等主題活動 |
| **組合包 Bundle** | 貼圖、主題 | 多個商品打包折扣價 |
| **兌換碼 Promo Code** | 全品類 | 創作者或官方發放的折扣碼 |
| **首購優惠** | 全品類 | 用戶首次購買該類商品折扣 |
| **創作者自訂折扣** | 自己的商品 | Creator Console 內設定折扣 |

### 建議 Phase 1 先做
1. **限時折扣**（最基本，涵蓋最多場景）
2. **兌換碼**（行銷必備）
3. **創作者自訂折扣**（讓創作者自主促銷）

### Phase 2
4. 組合包 Bundle
5. 節日活動促銷（需要活動管理後台）
6. 首購優惠

---

## 3. 資料庫設計

### 核心表：`promotions`

```sql
CREATE TABLE promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 促銷基本資訊
    name TEXT NOT NULL,                    -- 促銷名稱（內部用）
    display_name TEXT,                     -- 顯示名稱（給用戶看）
    description TEXT,                      -- 促銷描述

    -- 折扣類型
    discount_type TEXT NOT NULL,           -- 'percentage' | 'fixed_amount' | 'fixed_price'
    discount_value DECIMAL(10,2) NOT NULL, -- 折扣值（百分比 0-100 或金額）

    -- 適用範圍
    scope TEXT NOT NULL,                   -- 'global' | 'category' | 'specific'
    category TEXT,                         -- 'sticker' | 'theme' | 'app' （scope=category 時）

    -- 時間範圍
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,

    -- 限制
    max_uses INT,                          -- 總使用次數上限（NULL=無限）
    max_uses_per_user INT DEFAULT 1,       -- 每用戶使用次數上限
    current_uses INT NOT NULL DEFAULT 0,   -- 已使用次數
    min_price DECIMAL(10,2),               -- 最低消費金額

    -- 創作者相關
    creator_id TEXT,                       -- NULL=官方促銷，有值=創作者自訂

    -- 狀態
    status TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'active' | 'expired' | 'cancelled'

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 促銷-商品關聯表：`promotion_items`

```sql
CREATE TABLE promotion_items (
    promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,

    -- 多型關聯：支援不同商品類型
    item_type TEXT NOT NULL,               -- 'sticker_pack' | 'theme' | 'space_app'
    item_id TEXT NOT NULL,                 -- 對應商品 ID

    -- 可覆寫個別商品的折扣（NULL=用 promotion 的預設值）
    override_discount_value DECIMAL(10,2),

    PRIMARY KEY (promotion_id, item_type, item_id)
);
```

### 兌換碼表：`promo_codes`

```sql
CREATE TABLE promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,             -- 兌換碼（大寫英數）
    promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,

    max_uses INT DEFAULT 1,                -- 總使用次數（1=一次性碼）
    current_uses INT NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ                 -- NULL=跟隨 promotion 的 ends_at
);

CREATE INDEX idx_promo_codes_code ON promo_codes(code);
```

### 使用紀錄表：`promotion_usages`

```sql
CREATE TABLE promotion_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id UUID NOT NULL REFERENCES promotions(id),
    user_id TEXT NOT NULL,
    promo_code_id UUID REFERENCES promo_codes(id),  -- NULL=非兌換碼促銷

    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,

    original_price DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) NOT NULL,
    final_price DECIMAL(10,2) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. API 設計

### 買家端

```
GET  /api/promotions/active                    -- 目前進行中的促銷列表
GET  /api/promotions/{itemType}/{itemId}       -- 查詢某商品的可用促銷
POST /api/promo-codes/redeem                   -- 兌換折扣碼
     body: { code: "SPRING2026", itemType: "theme", itemId: "..." }
```

### Creator Console

```
GET    /api/creator/promotions                 -- 我的促銷列表
POST   /api/creator/promotions                 -- 建立促銷
PUT    /api/creator/promotions/{id}            -- 修改促銷
DELETE /api/creator/promotions/{id}            -- 取消促銷
POST   /api/creator/promotions/{id}/codes      -- 產生兌換碼
```

### Admin

```
GET  /api/admin/promotions                     -- 所有促銷（含官方）
POST /api/admin/promotions                     -- 建立官方促銷
```

---

## 5. 前端 UI

### 商品列表 / 詳情頁
- 原價劃掉線 + 特價紅字
- 「限時特價」標籤 + 倒數計時器
- 折扣百分比標章（如 `-30%`）

### Sticker Shop / Theme Store / App Store
- 頂部 Banner 輪播促銷活動
- 「特價中」篩選分頁
- 閃購區塊（有倒數）

### Creator Console
- 促銷管理頁面
- 設定折扣幅度、時間區間、適用商品
- 產生/管理兌換碼
- 促銷成效數據（使用次數、帶來的銷售額）

### 結帳流程
- 購買時自動套用最佳促銷
- 輸入兌換碼欄位
- 顯示原價、折扣、最終價格明細

---

## 6. 商業規則

1. **折扣不疊加** — 同一商品只套用最優惠的一個促銷
2. **創作者折扣上限** — 創作者自訂折扣最高 50%（防止惡意操作）
3. **冷卻期** — 同商品兩次促銷間至少間隔 7 天（防止「永遠在特價」）
4. **平台分潤不變** — 折扣由創作者承擔，平台抽成比例不變（或可談）
5. **免費商品不適用** — 已是免費的商品不能再套促銷
6. **退款規則** — 特價購買的商品退款按實付金額

---

## 7. 優先級建議

| Phase | 功能 | 預估複雜度 |
|-------|------|-----------|
| P1 | promotions + promotion_items 表 | 中 |
| P1 | 商品頁面顯示折扣價 + 標籤 | 低 |
| P1 | Creator Console 促銷管理 | 中 |
| P1 | 購買流程套用促銷 | 中 |
| P2 | promo_codes 兌換碼系統 | 中 |
| P2 | 促銷活動 Banner + 倒數 | 低 |
| P2 | Admin 後台促銷管理 | 中 |
| P3 | Bundle 組合包 | 高 |
| P3 | 促銷成效分析 Dashboard | 中 |
