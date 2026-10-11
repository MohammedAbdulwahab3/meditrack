# MediTrack

MediTrack lets anyone check that a medicine pack is genuine. Every pack gets its own unguessable code, printed as a QR label. Each hand-off from manufacturer to importer to pharmacy is recorded, so a scan shows where the pack came from and whether it's safe to use.

## Who uses it

| Role | What they do |
|---|---|
| **Manufacturer** | Registers products. Creates batches, each minting one code per pack. Prints QR labels, ships packs, recalls batches. |
| **Importer / distributor** | Receives shipments, holds stock, ships to pharmacies. |
| **Pharmacy** | Receives shipments and manages stock (expiry, low-stock, recalls). Dispenses packs by scan or by quantity (earliest expiry first). Sells to patients through pickup reservations and buys stock from suppliers. |
| **Patient / public** | Scans a pack with a phone camera (no account needed) and can report suspicious medicine. Can find which pharmacies have a medicine and at what price. Signed-in patients reserve it for pickup and keep a scan history. |
| **Admin** | Approves or rejects organizations, suspends organizations, users and products, recalls batches, handles counterfeit reports, and reads the audit log. |

## Marketplace

Sellers set a price per pack under **Prices & listings**. Only listed products count toward offers, and only genuine stock: in date, not recalled, and not already held for another customer.

- **Patients → pharmacies (retail).** Patients search **Find medicine** on the web (`/find`, also public) or in the mobile app. They compare pharmacies by price and stock and **reserve for pickup**, then pay at the counter.
  1. The pharmacy **confirms**, which holds the stock. Walk-in sales can't take held stock.
  2. At pickup it marks the order **collected**. Specific packs are dispensed earliest-expiry-first and recorded against the order.
  3. The patient sees each pack's code and can verify it. Prescription medicines are flagged; the pharmacy checks the prescription at pickup.
- **Pharmacies → manufacturers & importers (wholesale).** Under **Buy stock**, pharmacies see suppliers' live stock, price and earliest expiry, and send a purchase order.
  1. The supplier **accepts**, which automatically creates a tracked shipment (earliest-expiry-first).
  2. The order becomes **delivered** when the pharmacy receives the shipment. If the pharmacy rejects the shipment, the order is marked **returned**.

Order statuses:
- **Retail:** `pending → confirmed → completed`, or `rejected` / `cancelled`.
- **Wholesale:** `pending → accepted → delivered`, or `returned` / `rejected` / `cancelled`.

## How a pack is judged

`GET /api/verify/{code}` returns one of these results:

- **`genuine`** – the code exists and every check passes.
- **`not_found`** – the code was never issued.
- **`recalled`** – the batch was recalled.
- **`suspended`** – an admin suspended the product.
- **`expired`** – the pack is past its expiry date.
- **`warning`** – the code is real, but at least 3 other people/devices have checked it. Its label may have been copied onto fakes, and the manufacturer and admins are alerted once.

The response also includes the pack's full journey (manufactured → shipped → received → dispensed) and who holds it now.

## Custody model

- Every pack is a row in `units`. A pack is either `in_stock` at one organization, `in_transit` inside a shipment, or `dispensed` to a patient. Database constraints enforce this.
- Shipments lock the exact packs they carry (`SELECT … FOR UPDATE`), so the same pack can never be shipped twice. A concurrency test covers this.
- Allowed routes:
  - Manufacturer → importer or pharmacy
  - Importer → importer or pharmacy
  - Pharmacy → pharmacy
- Recalled and expired stock can't be shipped or dispensed.
- New organizations start as **pending**. Nothing they do takes effect until an admin approves them, which also starts their 30-day trial.

## Architecture

```
            ┌──────────── Caddy (HTTPS, :80/:443) ────────────┐
 browser ──►│  /api/*  → api  (Go, :8090)                      │
            │  /*      → web  (Next.js, :3000)                 │
            └──────────────────────────────────────────────────┘
                              api ──► PostgreSQL 16
```

- **backend/**: one Go service (chi + pgx).
  - Business rules live in `internal/app`.
  - HTTP handlers live in `internal/httpapi`.
  - SQL migrations are embedded and applied automatically at startup.
  - Sessions are opaque tokens stored hashed in Postgres, sent as an httpOnly cookie (or `Authorization: Bearer` for mobile clients via `X-Client: mobile` on login).
  - Cookie-authenticated writes require an `X-Requested-With` header (CSRF protection).
  - Login, verification and reports are rate-limited per IP.
- **mobile/**: Flutter app for patients. It verifies packs by camera, keeps history on the phone or in the account, sends counterfeit reports, and supports an optional account. See `mobile/README.md`.
- **web/**: Next.js 16 + Tailwind 4 + TanStack Query.
  - Public site, camera QR scanner, and verification pages.
  - Role-based dashboards, plus printable QR label sheets.

## Run it with Docker

```bash
cp .env.example .env      # then edit the secrets
docker compose up -d --build
# optional: load demo data (only works on an empty database)
docker compose exec api seed
```

Then:

- Open http://localhost (or the `HTTP_PORT` you chose).
- Sign in with your `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- If you loaded demo data, the demo accounts are also available. They all use the password `password123`, and the seed prints a few pack codes to try.

For a real deployment:

1. Set `SITE_ADDRESS=your.domain` and `PUBLIC_URL=https://your.domain`.
2. Set `COOKIE_SECURE=true`.
3. Point DNS at the server. Caddy obtains TLS certificates automatically.

## Develop locally

```bash
# database (host networking avoids Docker port-forwarding, which is broken on some snap installs)
docker run -d --name meditrack-db --network host -e POSTGRES_USER=meditrack -e POSTGRES_PASSWORD=meditrack \
  -e POSTGRES_DB=meditrack postgres:16-alpine -c port=5433 -c listen_addresses=127.0.0.1

# API on :8090 (defaults point at the database above)
cd backend
ADMIN_EMAIL=admin@meditrack.local ADMIN_PASSWORD=password123 go run ./cmd/server
go run ./cmd/seed            # demo data, optional

# web on :3000 (proxies /api to :8090)
cd web && npm install && npm run dev
```

Tests need a disposable database. They wipe its `public` schema.

```bash
cd backend
TEST_DATABASE_URL=postgres://meditrack:meditrack@localhost:5433/meditrack?sslmode=disable go test -race ./...
```

The integration test drives the whole supply chain over HTTP. It covers:

- Organization approval, then minting, shipping, receiving, rejecting, and dispensing.
- Public verification and pack journeys.
- Clone detection and recalls.
- CSRF protection, tenant isolation, and admin oversight.
- Concurrent shipments never overselling stock.

## Configuration (API)

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://meditrack:meditrack@localhost:5433/meditrack?sslmode=disable` | |
| `PORT` | `8090` | |
| `APP_ENV` | `development` | `production` requires `SECRET_KEY` (32+ chars) |
| `SECRET_KEY` | dev value | HMAC key used to anonymise scanner IPs |
| `COOKIE_SECURE` | `true` in production | Set `false` only for plain-HTTP local runs |
| `TRUST_PROXY` | `false` | Read the client IP from `X-Forwarded-For`. Enable only behind Caddy or another proxy you control. |
| `SESSION_TTL_HOURS` | `168` | |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | – | Creates the first admin if none exists |

The web app reads `API_URL` (dev proxy target, **at build time**) and `NEXT_PUBLIC_SITE_URL` (the domain printed into QR labels; defaults to the current origin).

## Not built yet

- **Billing.** Plans and trial dates exist; Chapa checkout and subscription enforcement are next.
- **Email/SMS delivery of notifications.** Today they are in-app only.
- **Password reset and email verification.**
- **Amharic translation and offline scan queueing** for low-connectivity pharmacies.
- **Mobile app for pharmacy staff.** The patient app is in `mobile/`. Pharmacies use the web dashboard, which works on phones.
