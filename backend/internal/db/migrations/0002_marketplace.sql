-- Marketplace: sellers list products with a price; patients reserve from pharmacies (retail),
-- pharmacies buy from manufacturers and importers (wholesale).

CREATE TABLE listings (
    organization_id uuid NOT NULL REFERENCES organizations (id),
    product_id      uuid NOT NULL REFERENCES products (id),
    unit_price      numeric(12, 2) NOT NULL CHECK (unit_price > 0),
    currency        text NOT NULL DEFAULT 'ETB',
    is_listed       boolean NOT NULL DEFAULT true,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, product_id)
);
CREATE INDEX listings_product_idx ON listings (product_id) WHERE is_listed;

CREATE SEQUENCE order_reference_seq;

-- retail:    pending -> confirmed (stock held) -> completed (picked up)   | rejected | cancelled
-- wholesale: pending -> accepted (shipment sent) -> delivered | returned   | rejected | cancelled
CREATE TABLE orders (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference      text NOT NULL UNIQUE,
    kind           text NOT NULL CHECK (kind IN ('retail', 'wholesale')),
    buyer_user_id  uuid NOT NULL REFERENCES users (id),
    buyer_org_id   uuid REFERENCES organizations (id),
    seller_org_id  uuid NOT NULL REFERENCES organizations (id),
    status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'confirmed', 'completed', 'accepted', 'delivered', 'returned', 'rejected', 'cancelled')),
    note           text NOT NULL DEFAULT '',
    decline_reason text NOT NULL DEFAULT '',
    total          numeric(14, 2) NOT NULL DEFAULT 0,
    currency       text NOT NULL DEFAULT 'ETB',
    shipment_id    uuid REFERENCES shipments (id),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    closed_at      timestamptz,
    CONSTRAINT orders_buyer_matches_kind CHECK ((kind = 'retail') = (buyer_org_id IS NULL))
);
CREATE INDEX orders_seller_idx ON orders (seller_org_id, status, created_at DESC);
CREATE INDEX orders_buyer_user_idx ON orders (buyer_user_id, created_at DESC);
CREATE INDEX orders_buyer_org_idx ON orders (buyer_org_id, created_at DESC) WHERE buyer_org_id IS NOT NULL;
CREATE INDEX orders_shipment_idx ON orders (shipment_id) WHERE shipment_id IS NOT NULL;

CREATE TABLE order_items (
    order_id   uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products (id),
    quantity   integer NOT NULL CHECK (quantity > 0),
    unit_price numeric(12, 2) NOT NULL,
    PRIMARY KEY (order_id, product_id)
);

-- Packs handed over for a retail order, so the patient can verify each one.
ALTER TABLE units ADD COLUMN order_id uuid REFERENCES orders (id);
CREATE INDEX units_order_idx ON units (order_id) WHERE order_id IS NOT NULL;
