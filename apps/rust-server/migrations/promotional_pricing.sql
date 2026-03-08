-- Promotional Pricing Phase 1: promotions, promotion_items, promo_codes, promotion_usages

CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Basic info
    name TEXT NOT NULL,
    display_name TEXT,
    description TEXT,

    -- Discount type
    discount_type TEXT NOT NULL,            -- 'percentage' | 'fixed_amount' | 'fixed_price'
    discount_value DECIMAL(10,2) NOT NULL,  -- percentage 0-100 or coin amount

    -- Scope
    scope TEXT NOT NULL,                    -- 'global' | 'category' | 'specific'
    category TEXT,                          -- 'sticker' | 'theme' | 'app' (when scope='category')

    -- Time window
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,

    -- Limits
    max_uses INT,                           -- NULL = unlimited
    max_uses_per_user INT DEFAULT 1,
    current_uses INT NOT NULL DEFAULT 0,
    min_price DECIMAL(10,2),                -- minimum original price to qualify

    -- Creator (NULL = official/admin promotion)
    creator_id TEXT,

    -- Status
    status TEXT NOT NULL DEFAULT 'draft',   -- 'draft' | 'active' | 'expired' | 'cancelled'

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_status ON promotions(status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_promotions_creator ON promotions(creator_id) WHERE creator_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS promotion_items (
    promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL,                -- 'sticker_pack' | 'theme' | 'agent_listing'
    item_id TEXT NOT NULL,
    override_discount_value DECIMAL(10,2),
    PRIMARY KEY (promotion_id, item_type, item_id)
);

CREATE TABLE IF NOT EXISTS promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    max_uses INT DEFAULT 1,
    current_uses INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ                  -- NULL = follows promotion ends_at
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);

CREATE TABLE IF NOT EXISTS promotion_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id UUID NOT NULL REFERENCES promotions(id),
    user_id TEXT NOT NULL,
    promo_code_id UUID REFERENCES promo_codes(id),
    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    original_price DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) NOT NULL,
    final_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotion_usages_user ON promotion_usages(user_id, promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_usages_item ON promotion_usages(item_type, item_id);
