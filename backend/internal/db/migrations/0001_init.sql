-- MediTrack core schema.
-- Custody model: every physical pack is a row in `units` with a public, unguessable `code`
-- (printed as a QR). A unit is always either held by one organization or dispensed to a patient.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE organizations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    type            text NOT NULL CHECK (type IN ('manufacturer', 'importer', 'pharmacy')),
    license_number  text NOT NULL,
    country         text NOT NULL,
    city            text NOT NULL,
    address         text NOT NULL DEFAULT '',
    phone           text NOT NULL DEFAULT '',
    email           text NOT NULL DEFAULT '',
    status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'suspended', 'rejected')),
    status_reason   text NOT NULL DEFAULT '',
    approved_at     timestamptz,
    trial_ends_at   timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX organizations_license_key ON organizations (type, lower(license_number));
CREATE INDEX organizations_status_idx ON organizations (status, type);

CREATE TABLE users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email           text NOT NULL,
    password_hash   text NOT NULL,
    full_name       text NOT NULL,
    phone           text NOT NULL DEFAULT '',
    role            text NOT NULL CHECK (role IN ('admin', 'manufacturer', 'importer', 'pharmacy', 'patient')),
    organization_id uuid REFERENCES organizations (id),
    is_active       boolean NOT NULL DEFAULT true,
    last_login_at   timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    -- business users always belong to an organization; admins and patients never do
    CONSTRAINT users_org_matches_role CHECK ((role IN ('admin', 'patient')) = (organization_id IS NULL))
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE INDEX users_org_idx ON users (organization_id);

CREATE TABLE sessions (
    token_hash   bytea PRIMARY KEY,
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    user_agent   text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE products (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    manufacturer_id       uuid NOT NULL REFERENCES organizations (id),
    name                  text NOT NULL,
    generic_name          text NOT NULL,
    strength              text NOT NULL,
    dosage_form           text NOT NULL,
    category              text NOT NULL DEFAULT '',
    pack_size             text NOT NULL DEFAULT '',
    description           text NOT NULL DEFAULT '',
    requires_prescription boolean NOT NULL DEFAULT false,
    status                text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'suspended', 'discontinued')),
    status_reason         text NOT NULL DEFAULT '',
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX products_identity_key
    ON products (manufacturer_id, lower(name), lower(strength), lower(dosage_form));

CREATE TABLE batches (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      uuid NOT NULL REFERENCES products (id),
    manufacturer_id uuid NOT NULL REFERENCES organizations (id),
    batch_number    text NOT NULL,
    manufactured_on date NOT NULL,
    expires_on      date NOT NULL,
    quantity        integer NOT NULL CHECK (quantity BETWEEN 1 AND 50000),
    recalled_at     timestamptz,
    recall_reason   text NOT NULL DEFAULT '',
    created_by      uuid REFERENCES users (id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT batches_dates_check CHECK (expires_on > manufactured_on)
);
CREATE UNIQUE INDEX batches_number_key ON batches (manufacturer_id, lower(batch_number));
CREATE INDEX batches_product_idx ON batches (product_id);

CREATE TABLE shipments (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference        text NOT NULL UNIQUE,
    from_org_id      uuid NOT NULL REFERENCES organizations (id),
    to_org_id        uuid NOT NULL REFERENCES organizations (id),
    status           text NOT NULL DEFAULT 'in_transit'
                     CHECK (status IN ('in_transit', 'received', 'rejected', 'cancelled')),
    notes            text NOT NULL DEFAULT '',
    rejection_reason text NOT NULL DEFAULT '',
    created_by       uuid REFERENCES users (id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    closed_at        timestamptz,
    closed_by        uuid REFERENCES users (id),
    CONSTRAINT shipments_distinct_parties CHECK (from_org_id <> to_org_id)
);
CREATE INDEX shipments_from_idx ON shipments (from_org_id, created_at DESC);
CREATE INDEX shipments_to_idx ON shipments (to_org_id, created_at DESC);
CREATE SEQUENCE shipment_reference_seq;

CREATE TABLE shipment_lines (
    shipment_id uuid NOT NULL REFERENCES shipments (id) ON DELETE CASCADE,
    batch_id    uuid NOT NULL REFERENCES batches (id),
    quantity    integer NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (shipment_id, batch_id)
);

CREATE TABLE units (
    id                bigserial PRIMARY KEY,
    code              text NOT NULL UNIQUE,
    batch_id          uuid NOT NULL REFERENCES batches (id),
    serial            integer NOT NULL,
    status            text NOT NULL DEFAULT 'in_stock'
                      CHECK (status IN ('in_stock', 'in_transit', 'dispensed')),
    holder_id         uuid REFERENCES organizations (id),
    shipment_id       uuid REFERENCES shipments (id),
    dispensed_at      timestamptz,
    dispensed_by_org  uuid REFERENCES organizations (id),
    UNIQUE (batch_id, serial),
    CONSTRAINT units_state_check CHECK (
        (status = 'in_stock'   AND holder_id IS NOT NULL AND shipment_id IS NULL) OR
        (status = 'in_transit' AND holder_id IS NOT NULL AND shipment_id IS NOT NULL) OR
        (status = 'dispensed'  AND holder_id IS NULL AND dispensed_at IS NOT NULL)
    )
);
CREATE INDEX units_holder_idx ON units (holder_id, status, batch_id);
CREATE INDEX units_shipment_idx ON units (shipment_id) WHERE shipment_id IS NOT NULL;
CREATE INDEX units_dispensed_idx ON units (dispensed_by_org, dispensed_at DESC) WHERE status = 'dispensed';

-- Every shipment a unit has ever travelled in, for the public journey view.
CREATE TABLE shipment_units (
    shipment_id uuid NOT NULL REFERENCES shipments (id) ON DELETE CASCADE,
    unit_id     bigint NOT NULL REFERENCES units (id),
    PRIMARY KEY (shipment_id, unit_id)
);
CREATE INDEX shipment_units_unit_idx ON shipment_units (unit_id);

CREATE TABLE stock_thresholds (
    organization_id uuid NOT NULL REFERENCES organizations (id),
    product_id      uuid NOT NULL REFERENCES products (id),
    min_quantity    integer NOT NULL CHECK (min_quantity >= 0),
    PRIMARY KEY (organization_id, product_id)
);

CREATE TABLE scans (
    id             bigserial PRIMARY KEY,
    code           text NOT NULL,
    unit_id        bigint REFERENCES units (id),
    result         text NOT NULL,
    user_id        uuid REFERENCES users (id),
    scanner_role   text NOT NULL DEFAULT 'public',
    fingerprint    text NOT NULL,
    user_agent     text NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scans_unit_idx ON scans (unit_id, created_at);
CREATE INDEX scans_user_idx ON scans (user_id, created_at DESC);
CREATE INDEX scans_created_idx ON scans (created_at);

CREATE TABLE counterfeit_reports (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code          text NOT NULL DEFAULT '',
    unit_id       bigint REFERENCES units (id),
    reporter_id   uuid REFERENCES users (id),
    contact       text NOT NULL DEFAULT '',
    product_name  text NOT NULL DEFAULT '',
    place         text NOT NULL DEFAULT '',
    description   text NOT NULL,
    status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'closed')),
    admin_note    text NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX counterfeit_reports_status_idx ON counterfeit_reports (status, created_at DESC);

CREATE TABLE notifications (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations (id),
    user_id         uuid REFERENCES users (id),
    for_admins      boolean NOT NULL DEFAULT false,
    kind            text NOT NULL,
    title           text NOT NULL,
    body            text NOT NULL DEFAULT '',
    link            text NOT NULL DEFAULT '',
    read_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_org_idx ON notifications (organization_id, created_at DESC);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_admin_idx ON notifications (created_at DESC) WHERE for_admins;

CREATE TABLE audit_events (
    id              bigserial PRIMARY KEY,
    actor_id        uuid REFERENCES users (id),
    organization_id uuid REFERENCES organizations (id),
    action          text NOT NULL,
    entity_type     text NOT NULL,
    entity_id       text NOT NULL,
    details         jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_created_idx ON audit_events (created_at DESC);
CREATE INDEX audit_events_org_idx ON audit_events (organization_id, created_at DESC);
