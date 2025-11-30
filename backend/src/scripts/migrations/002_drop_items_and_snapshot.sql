-- 002_drop_items_and_snapshot.sql
-- Ensure cart_items has product_id, copy product snapshot into cart_items.metadata, index product_id, then drop items table

BEGIN;

-- 1) Add product_id column if missing
ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS product_id TEXT;

-- 2) Ensure metadata column exists and is jsonb
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cart_items' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE cart_items ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
  ELSE
    -- Try to cast to jsonb if needed
    BEGIN
      ALTER TABLE cart_items ALTER COLUMN metadata SET DATA TYPE jsonb USING (metadata::jsonb);
    EXCEPTION WHEN others THEN
      -- leave as-is if cast fails
      RAISE NOTICE 'Could not cast cart_items.metadata to jsonb - leaving as-is';
    END;
  END IF;
END$$;

-- 3) If items table exists, attach a product snapshot into cart_items.metadata->'product_snapshot'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'items') THEN
    UPDATE cart_items ci
    SET metadata = COALESCE(ci.metadata, '{}'::jsonb) || jsonb_build_object('product_snapshot', to_jsonb(i.*))
    FROM items i
    WHERE ci.product_id IS NOT NULL AND (ci.product_id = i.id OR (i.id::text = ci.product_id));
  END IF;
END$$;

-- 4) Create index on product_id for performance
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON cart_items (product_id);

-- 5) Drop items table (after snapshot)
DROP TABLE IF EXISTS items;

COMMIT;
