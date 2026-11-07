# PathPoint_BD

**Urban transit & commuter carpooling platform** for dense cities such as Dhaka and Chattogram.
Built for the **Credosis Backend Engineer Intern — Phase 2** selection process.

> **Status:** all seven blocks complete — foundation, authentication, rides, geospatial
> matching, ride requests, atomic bookings, live traffic over SSE, and the Next.js
> dashboard. Deployment blueprints for Render + Vercel are included.

---

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 24, TypeScript (strict, ESM) |
| HTTP | Express 5 |
| Database | MongoDB Atlas, Mongoose 8, `2dsphere` indexes |
| Validation | Zod 4 — one schema per request, reused to generate OpenAPI |
| Auth | JWT (HS256, issuer + audience pinned), bcrypt (cost 12) |
| Docs | `@scalar/express-api-reference` at `/docs`, spec at `/openapi.json` |
| Realtime | Server-Sent Events (`text/event-stream`), in-process hub + simulator |
| Web | Next.js 16 App Router, React 19, TypeScript, hand-written CSS |
| Logging | pino + pino-http, request-id correlated |
| Tests | Vitest + supertest + mongodb-memory-server |

---

## Architecture

A **modular monolith** with a strictly one-directional dependency flow:

```
routes → controller → service → repository → model
                 ↘  schemas (Zod)  ↙
        lib/ + config/ usable by every layer
```

- **Controllers** only translate HTTP: read validated input, call one service, shape the response.
- **Services** hold business rules and never import Express (`req`/`res` never leak downward).
- **Repositories** own Mongo queries and contain no business rules.
- **Models** are the last line of defence: schema-level validators stop malformed geo data from ever reaching a `2dsphere` index.
- Cross-module traffic goes **service → service** only, which keeps the graph acyclic.
- The SSE hub is transport-only: any module can publish events without importing Express.

Request lifecycle:

```
requestId → pino-http → helmet → cors → body limits → rate limit
          → route → validate(Zod) → authenticate → authorize
          → controller → service → repository → Mongo
          → sendSuccess  |  any throw → errorHandler → ErrorEnvelope
```

---

## Repository layout

```
PathPoint_BD/
├─ render.yaml                 # Render blueprint (rootDir: server)
├─ package.json                # root convenience scripts
├─ server/
│  ├─ src/
│  │  ├─ index.ts              # listen, DB connect, simulator, graceful shutdown
│  │  ├─ app.ts                # Express app factory (testable, no listen)
│  │  ├─ config/               # env (Zod-validated), db, constants
│  │  ├─ lib/                  # ApiError, ApiResponse, jwt, password, geo, pagination, logger, sse/
│  │  ├─ middleware/           # requestId, validate, authenticate, authorize, rateLimit, errorHandler
│  │  ├─ modules/
│  │  │  ├─ auth/              # schemas → service → controller → routes
│  │  │  ├─ users/             # user.model.ts (+ response schemas)
│  │  │  ├─ rides/             # model, schemas, mapper, repository, service, controller, routes
│  │  │  ├─ matching/          # search schemas, scoring, service, controller, routes
│  │  │  ├─ requests/          # rider intent + reverse matching
│  │  │  ├─ bookings/          # atomic seat reservation, confirm, cancel
│  │  │  ├─ traffic/           # SSE stream, buffered events, simulator
│  │  │  └─ health/            # liveness + readiness
│  │  ├─ routes/               # /api/v1 index, /docs + /openapi.json
│  │  ├─ openapi/              # Zod → JSON Schema → OpenAPI 3.1 document
│  │  ├─ seed/                 # data.ts (fixtures), seed.ts (idempotent seed), run.ts (CLI)
│  │  └─ types/                # Express request augmentation
│  └─ tests/                   # 127 integration + unit tests over a real MongoDB
└─ web/
   ├─ app/
   │  ├─ page.tsx              # sign in / register + demo accounts
   │  ├─ search/page.tsx       # commute search, score breakdown, booking, ride requests
   │  ├─ dashboard/page.tsx    # rides, bookings, requests, live SSE traffic
   │  └─ rides/[id]/page.tsx   # ride detail, booking, driver reverse matching
   ├─ components/              # Nav + shared UI (badges, score ring, breakdown)
   └─ lib/                     # typed API client, session, formatting, SSE hook
```

---

## Quick start

```bash
# 1. Install (Windows: use npm.cmd if npm.ps1 is blocked by execution policy)
npm run install:all            # installs server + web

# 2. Configure the API
cd server
cp .env.example .env           # set MONGODB_URI (Atlas or local) and JWT_SECRET

# 3. Seed realistic Dhaka + Chattogram data (idempotent)
npm run seed

# 4. Run the API
npm run dev                    # http://localhost:4000  (docs at /docs)

# 5. Run the dashboard (new terminal)
cd ../web
cp .env.example .env.local     # NEXT_PUBLIC_API_URL=http://localhost:4000
npm run dev                    # http://localhost:3000
```

Verify everything:

```bash
# API
cd server
npm run typecheck
npm test                       # 127 tests
npm run build && npm start

# Web
cd ../web
npm run typecheck
npm run build
```

`npm run seed` prints the demo accounts. Every seeded account uses the password
`PathPoint123`:

| Role | Email |
|---|---|
| driver | `driver.uttara@pathpoint.test` |
| driver | `driver.banani@pathpoint.test` |
| driver | `driver.gulshan@pathpoint.test` |
| driver | `driver.dhanmondi@pathpoint.test` |
| driver | `driver.mirpur@pathpoint.test` |
| driver | `driver.gec@pathpoint.test` (Chattogram) |
| driver | `driver.agrabad@pathpoint.test` (Chattogram) |
| rider | `rider.dhanmondi@pathpoint.test` |
| rider | `rider.agrabad@pathpoint.test` |

The seed only ever deletes accounts ending in `@pathpoint.test`, so running it
against a real database cannot wipe unrelated data.

Generate a production-grade secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## API

Base path: `/api/v1` — interactive docs: **`/docs`**

### Auth & system

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | — | Create rider/driver account, returns JWT |
| POST | `/auth/login` | — | Exchange credentials for a JWT |
| GET | `/auth/me` | Bearer | Current user profile |
| GET | `/meta` | — | Service discovery (version, module list) |
| GET | `/health` | — | Liveness (never touches Mongo) |
| GET | `/health/ready` | — | Readiness (503 when Mongo is down) |
| GET | `/docs` | — | Scalar API reference |
| GET | `/openapi.json` | — | Generated OpenAPI 3.1 document |

### Rides & matching

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/rides` | Bearer | Publish a ride offer |
| GET | `/rides` | — | List/filter rides (public) |
| GET | `/rides/mine` | Bearer | Rides published by the caller |
| GET | `/rides/:id` | — | Ride detail |
| PATCH | `/rides/:id` | Bearer | Update a ride you own |
| DELETE | `/rides/:id` | Bearer | Soft-cancel a ride you own |
| POST | `/matches/search` | Bearer | Ranked commute matches with score breakdown |

### Ride requests (rider intent)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/matches/requests` | Bearer | Publish a ride request |
| GET | `/matches/requests` | Bearer | List/filter requests |
| GET | `/matches/requests/mine` | Bearer | Requests published by the caller |
| GET | `/matches/requests/reverse?rideId=…` | Bearer | Driver-facing reverse matching |
| GET | `/matches/requests/:id` | Bearer | Request detail (owner/admin) |
| DELETE | `/matches/requests/:id` | Bearer | Soft-cancel an open request |

### Bookings

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/rides/:rideId/bookings` | Bearer | Atomically reserve seats |
| GET | `/bookings` | Bearer | My bookings (as rider) |
| GET | `/bookings/received` | Bearer | Bookings received (as driver) |
| GET | `/bookings/:id` | Bearer | Booking detail (rider/driver/admin) |
| POST | `/bookings/:id/confirm` | Bearer | Driver confirms a pending booking |
| POST | `/bookings/:id/cancel` | Bearer | Either party cancels; seats restored |

### Live traffic (SSE)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/traffic/stream` | — | Public SSE feed (`?city=dhaka\|chattogram`) |
| GET | `/traffic/events` | — | Recent buffered events (max 100) |
| GET | `/traffic/stats` | — | Subscriber count + simulator state |
| POST | `/traffic/simulate` | Bearer | Emit a congestion event on demand |

### Conventions

Success:

```json
{ "success": true, "data": { }, "timestamp": "2026-11-05T10:12:33.401Z" }
```

Failure — every failure, including 404s and 500s:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "path": "phone", "message": "Phone must be a Bangladeshi number in +8801XXXXXXXXX form" }],
    "requestId": "8f2c1e0a-..."
  },
  "timestamp": "2026-11-05T10:12:33.401Z"
}
```

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Zod failure (unknown keys included) |
| `BAD_REQUEST` | 400 | Malformed JSON, bad ObjectId |
| `UNAUTHORIZED` | 401 | Missing/invalid/expired token, bad credentials |
| `FORBIDDEN` | 403 | Wrong role, deactivated account, wrong owner |
| `NOT_FOUND` | 404 | Unknown route or resource |
| `CONFLICT` | 409 | Duplicate account/booking, no seats, invalid state transition |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `SERVICE_UNAVAILABLE` | 503 | Mongo not connected (`/health/ready`) |
| `INTERNAL` | 500 | Unexpected — message is masked in production |

`error.requestId` always matches the `x-request-id` response header.

### Auth example

```bash
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Ayesha Rahman","email":"ayesha@example.com","phone":"+8801712345678","password":"Dhaka2026","role":"rider"}'

curl http://localhost:4000/api/v1/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

**Validation rules enforced:** email format, Bangladeshi phone (`+8801[3-9]XXXXXXXX`),
password 8–72 chars with a letter and a number, unknown body keys rejected (`strictObject`),
and `role` limited to `rider|driver` — admin accounts cannot be self-registered.

**Auth tradeoff (documented deliberately):** short-lived bearer tokens returned in JSON,
no refresh token. It keeps the build honest; refresh rotation is the first
post-submission addition. The web app stores the token in `localStorage` and sends it as
`Authorization: Bearer …`.

---

## Rides & geospatial search

### Publishing a ride

```bash
TOKEN="<accessToken>"

curl -X POST http://localhost:4000/api/v1/rides \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "origin":      { "type": "Point", "coordinates": [90.4043, 23.7937] },
    "destination": { "type": "Point", "coordinates": [90.3742, 23.7461] },
    "originAddress": "Banani, Dhaka",
    "destinationAddress": "Dhanmondi 27, Dhaka",
    "departureAt": "2026-11-07T08:15:00.000Z",
    "seatsTotal": 3,
    "farePerSeat": 80,
    "vehicle": { "make": "Toyota", "model": "Corolla", "plate": "DHAKA METRO-GA-12-3456", "ac": true }
  }'
```

Design rules encoded in this endpoint:

- `driverId` always comes from the JWT — a client can never publish on someone else's behalf.
- `seatsAvailable` is derived from `seatsTotal`; sending it is rejected as an unknown key.
- Coordinates must be GeoJSON `[longitude, latitude]` inside Bangladesh
  (lng `88.0–92.7`, lat `20.5–26.7`). Latitude/longitude swaps are caught.
- `departureAt` must be at least one minute in the future.
- `farePerSeat` is driver-entered (0–10,000 BDT); no silent server-side pricing.

### Searching near a point

```bash
curl "http://localhost:4000/api/v1/rides?near=90.4043,23.7937&radiusMeters=5000&status=published"
```

When `near` is present the repository runs a `$geoNear` stage on the `origin`
`2dsphere` index, orders by `distanceMeters`, and wraps pagination in `$facet`
so `meta.total` stays correct. Without `near` it uses an index-backed
`find` + `countDocuments`.

Supported query parameters: `near`, `radiusMeters` (100–50,000),
`status`, `driverId`, `dateFrom`, `dateTo`, `sort`
(`departureAt`, `-departureAt`, `createdAt`, `-createdAt`, `farePerSeat`, `-farePerSeat`),
`page`, `limit`. Unknown parameters are rejected with `422`.

### Ownership rules

- `PATCH` / `DELETE` are allowed only for the driver who published the ride;
  admins are the single exception. Anyone else gets `403`.
- A well-formed but missing ride returns `404` **before** ownership is evaluated,
  so the API does not leak which ids exist.
- `DELETE` is a soft cancel: `status: "cancelled"` + `cancelledAt` are set,
  the document is retained for audit, and repeat calls are idempotent (`204`).
- Cancelled and completed rides are immutable (`409`).
- `seatsTotal` cannot be reduced below the number of seats already booked;
  `seatsAvailable` is recalculated from the delta, never trusted from the client.

---

## Commute matching

`POST /api/v1/matches/search` answers the core product question: *which
published rides actually fit this commuter's trip?* It is JWT-protected
because the requester's own rides must be excluded.

```bash
curl -X POST http://localhost:4000/api/v1/matches/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "origin":      { "type": "Point", "coordinates": [90.4043, 23.7937] },
    "destination": { "type": "Point", "coordinates": [90.3742, 23.7461] },
    "departureAt": "2026-11-07T08:15:00.000Z",
    "flexMinutes": 30,
    "seats": 1,
    "pickupRadiusMeters": 2000,
    "dropoffRadiusMeters": 1500,
    "limit": 20
  }'
```

### Pipeline

One aggregation, backed by both `2dsphere` indexes:

1. **`$geoNear` on `origin`** — nearest pickups first, capped by
   `pickupRadiusMeters`, and it owns the hard filters:
   `status: "published"`, `seatsAvailable >= seats`,
   `departureAt ∈ [departureAt − flexMinutes, departureAt + flexMinutes]`,
   `driverId != requester`, and `destination` inside a `$geoWithin`
   `$centerSphere` of the requested dropoff.
2. **Bearing filter** — a ride whose origin→destination bearing is more than
   **60°** away from the commuter's bearing is rejected (it is a different trip
   that merely starts nearby). Rejections are counted in `meta.rejectedBearing`.
3. **Scoring** — every surviving candidate is scored, sorted by score, then
   sliced to `limit`. Ties break on shorter pickup distance, then earlier
   departure.

### Score (0–100, fully exposed)

The four requested factors total 90 points, so a deliberately small
**availability** factor completes the 0–100 scale. Every component returns
`points`, `max` and the measurement behind it, so a commuter can audit the
ranking.

| Factor | Max | Measurement | Formula |
|---|---|---|---|
| Pickup proximity | 30 | metres from `$geoNear` | `30 × (1 − d / pickupRadius)` |
| Dropoff proximity | 25 | haversine metres | `25 × (1 − d / dropoffRadius)` |
| Time fit | 20 | minutes from preferred departure | `20 × (1 − Δ / flexMinutes)` |
| Bearing alignment | 15 | degrees of difference | `15 × (1 − Δ / 60)`; rejected if `Δ > 60` |
| Seat availability | 10 | free-seat ratio | `10 × seatsAvailable / seatsTotal` |

Each match carries the full ride card plus its score:

```json
{
  "score": 97.5,
  "breakdown": {
    "pickup":       { "points": 30,   "max": 30, "distanceMeters": 0, "radiusMeters": 2000 },
    "dropoff":      { "points": 25,   "max": 25, "distanceMeters": 0, "radiusMeters": 1500 },
    "time":         { "points": 18,   "max": 20, "deltaMinutes": 3,   "flexMinutes": 30 },
    "bearing":      { "points": 14.5, "max": 15, "deltaDegrees": 2,   "maxDeltaDegrees": 60 },
    "availability": { "points": 10,   "max": 10, "seatsAvailable": 3, "seatsTotal": 3, "seatsRequested": 1 }
  }
}
```

`meta` reports `candidates` (returned by Mongo), `rejectedBearing`, and
`returned`; `data.query` echoes the resolved window (`windowStart`,
`windowEnd`) so the client can display exactly what was searched.

---

## Ride requests & reverse matching

A **ride request** is rider intent, not a booking. It reserves nothing; it lets
drivers discover demand that fits a ride they are already making.

```bash
curl -X POST http://localhost:4000/api/v1/matches/requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RIDER_TOKEN" \
  -d '{
    "origin":      { "type": "Point", "coordinates": [90.4043, 23.7937] },
    "destination": { "type": "Point", "coordinates": [90.3742, 23.7461] },
    "originAddress": "Banani, Dhaka",
    "destinationAddress": "Dhanmondi 27, Dhaka",
    "departureAt": "2026-11-07T08:15:00.000Z",
    "flexMinutes": 15,
    "seats": 1,
    "maxFarePerSeat": 120
  }'
```

Reverse matching starts from one of the driver's own rides:

```bash
curl "http://localhost:4000/api/v1/matches/requests/reverse?rideId=<rideId>&pickupRadiusMeters=2000&dropoffRadiusMeters=2000" \
  -H "Authorization: Bearer $DRIVER_TOKEN"
```

- `$geoNear` on the request origin finds nearby pickups; `$geoWithin` on the
  request destination adds dropoff tolerance.
- Each request is filtered against the ride using **its own** `flexMinutes`
  (`|ride.departureAt − request.departureAt| ≤ request.flexMinutes`), so a
  ±15-minute request is not matched to a ride two hours away.
- Requests asking for more seats than the ride has free are excluded.
- Requests with a `maxFarePerSeat` below the ride fare are excluded; requests
  without a budget match any fare.
- A driver's own requests never match their own ride.
- Only the ride owner (or an admin) can run reverse matching for that ride.

---

## Bookings & concurrency

The central guarantee: **seats can never be oversold, even under concurrent
requests**, and cancellation can never inflate capacity.

### Atomic reservation

1. Read the ride and validate business rules (published, future, not own ride).
2. Fast pre-check for an existing active booking (friendly `409`).
3. **Atomically reserve seats** with one conditional update:
   `findOneAndUpdate({ _id, status: "published", seatsAvailable: { $gte: seats } }, …)`.
   MongoDB serialises writes to the document, so exactly the winners succeed.
4. Insert the booking row. If the insert fails for any reason (including the
   unique partial index rejecting a same-rider race), run a compensating
   `releaseSeats` before surfacing the error.

The order matters: seats are reserved before the insert, so a crash can never
leave a booking that holds no seats.

### One active booking per rider per ride

A partial unique index on `{ rideId, riderId }` with
`partialFilterExpression: { active: true }` enforces the rule. MongoDB partial
indexes do not support `$ne`, so the model keeps an internal `active` flag that
mirrors `status !== "cancelled"`. Cancelling flips it atomically, which frees
the pair for a legitimate re-booking.

### Cancellation

Either the rider or the driver may cancel. The transition
`pending|confirmed → cancelled` is a single conditional update; only the
request that wins it restores seats. The release is clamped at `seatsTotal` and
ignores cancelled/completed rides, so a double-cancel cannot inflate capacity.
Repeat calls are idempotent.

### Concurrency tests

`tests/bookings.test.ts` exercises real races against MongoDB:

- 5 riders / 2 seats → exactly 2 × `201`, 3 × `409`, 0 seats left, ride `full`.
- 5 riders / 3 seats, 2 seats each → exactly 1 × `201`, 1 seat left.
- Same rider double-clicks 4 times → one active booking, 3 seats left.
- Re-booking after cancellation succeeds without tripping the unique index.
- Double-cancel restores seats exactly once (never above `seatsTotal`).

---

## Live traffic over SSE

`GET /api/v1/traffic/stream` is a public `text/event-stream` endpoint. Reads are
public because `EventSource` cannot attach an `Authorization` header; writes
(`POST /traffic/simulate`) require a JWT.

Frames:

| Frame | Payload |
|---|---|
| `event: connected` | `{ clientId, connectedAt, heartbeatMs }` |
| `event: traffic` | a `TrafficEvent`; the SSE `id` is the event id |
| `event: shutdown` | `{ reason, at }` sent while draining |
| `: ping` | comment every `SSE_HEARTBEAT_MS` keeps proxies awake |

- The hub (`lib/sse/SseHub.ts`) is transport-only and fan-out is O(clients).
- Events live in a bounded 100-item in-memory ring buffer; `/traffic/events`
  serves recent history to late joiners. `Last-Event-ID` replay is intentionally
  not implemented — this is a live demo feed, not an event store.
- `?city=dhaka` / `?city=chattogram` filters server-side per subscriber.
- The simulator starts from `index.ts` when `TRAFFIC_SIM_ENABLED=true` and is
  stopped during graceful shutdown. `POST /traffic/simulate` emits an event on
  demand, which is what the dashboard's “Emit event” button uses.
- Response headers include `Cache-Control: no-cache, no-transform` and
  `X-Accel-Buffering: no` so Render/nginx do not buffer the stream.

---

## Web dashboard

A minimal four-page Next.js App Router client (`web/`), styled as a dark
“transit control room”. No CSS framework; the design system lives in
`web/app/globals.css`.

| Page | What it does |
|---|---|
| `/` | Sign in / register, one-click seeded demo accounts, account overview |
| `/search` | Corridor search with full score breakdown, seat booking, publish a ride request |
| `/dashboard` | Publish rides, reverse-match riders, confirm/cancel bookings, manage requests, live SSE traffic |
| `/rides/[id]` | Ride detail, seat reservation, driver reverse matching, cancel ride |

The token is stored in `localStorage` (`pathpoint.session.v1`); `useSession()`
broadcasts sign-in/out across the nav and pages. The API base URL comes from
`NEXT_PUBLIC_API_URL` (default `http://localhost:4000`).

---

## Testing

```bash
cd server
npm test
```

**127 tests across 8 files**, run against a real (in-memory) MongoDB — not mocks:

- health/readiness, 404 envelope, request-id propagation
- OpenAPI document validity, all module paths, strict schemas, Scalar availability
- registration, duplicate email/phone, password/phone/email validation, unknown-key rejection
- login success, identical 401 for wrong password vs unknown email
- bearer parsing: missing, malformed, wrong scheme, valid
- ride creation, ownership (`403`), `404` for unknown rides
- soft-cancel idempotency, immutable cancelled rides, seat-reduction guard (`409`)
- GeoJSON bounds, past departures, unknown keys, malformed ObjectIds
- `$geoNear` ordering + radius filtering through the real 2dsphere index
- matching: proximity/time/bearing ranking, self/seat/status/window/dropoff filters, score sums to 100
- unit tests for scoring monotonicity and bearing deltas across the 0°/360° boundary
- ride requests: CRUD, ownership, distance ordering, matched-cancel guard
- reverse matching: per-request flex windows, dropoff radius, seat/budget filters, own-request exclusion
- bookings: atomic races, duplicate guard, re-booking, confirm authorization/idempotency, double-cancel restoration
- SSE: hub fan-out and filters, real stream headers and `connected`/`traffic` frames
- seed dataset shape, Dhaka/Chattogram coverage, idempotency, 2dsphere index presence

> **Windows note:** `mongodb-memory-server` needs the Microsoft VC++ 2015–2022 runtime.
> If `mongod` exits with code `0xC0000135` / `-1073741515`, install
> [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe).
> In this workspace the required DLLs were copied next to the cached `mongod` binary.

---

## Demo script (≈3 minutes)

1. **Seed and start** — `cd server && npm run seed && npm run dev`, then
   `cd web && npm run dev`. Open `http://localhost:3000`.
2. **Sign in as a rider** — on `/`, click *Sign in as Sabrina* (or use
   `rider.dhanmondi@pathpoint.test` / `PathPoint123`).
3. **Search** — `/search` → Banani → Dhanmondi 27, a departure a few hours out,
   flex 30. Point out the 0–100 score ring and the five-factor breakdown
   (pickup, dropoff, time, bearing, seats). Book a seat.
4. **Switch to the driver** — sign out, click *Sign in as Nusrat*. On
   `/dashboard`, the booking appears under **Bookings → Received as driver**.
   Confirm it. Point out that confirming is an atomic, idempotent transition.
5. **Reverse matching** — under **My rides**, click **Find riders** on a ride.
   The seeded rider requests that fit the corridor appear, filtered by their own
   flex window, dropoff radius and budget.
6. **Live traffic** — open **Live traffic**. The SSE feed is already connected;
   click **Emit event** and watch a new congestion row appear without a refresh.
7. **Concurrency (optional)** — `cd server && npm test` and show the race tests:
   5 riders for 2 seats, exactly 2 succeed.
8. **Docs** — open `http://localhost:4000/docs` for the Scalar reference. Every
   request schema is generated from the same Zod object used at runtime.

Reset between demos: `npm run seed` (idempotent, demo accounts only).

---

## Deployment

### MongoDB Atlas

Create a free cluster and put the `mongodb+srv://` string in `MONGODB_URI`.
Geo fields use GeoJSON (`[longitude, latitude]`) validated against Bangladesh
bounds; `2dsphere` indexes on ride/request origins and destinations are created
by the models and guaranteed by the seed. Allow Render's egress (or `0.0.0.0/0`
for a demo) and use a least-privilege database user.

### Render (API)

`render.yaml` is a ready blueprint: `rootDir: server`, `healthCheckPath: /health`,
`JWT_SECRET` auto-generated, traffic simulator and SSE heartbeat configured.
Set `MONGODB_URI` and `CORS_ORIGINS` in the dashboard
(`CORS_ORIGINS=https://<your-app>.vercel.app`). Free-tier instances sleep, so
warm the service before a live demo.

```bash
# Manual equivalent
Build:  npm ci --include=dev && npm run build
Start:  npm start
Health: /health
```

> `--include=dev` matters: `NODE_ENV=production` makes npm omit devDependencies,
> and the TypeScript compiler lives there. The blueprint sets
> `MONGOMS_DISABLE_POSTINSTALL=1` so the test-only in-memory MongoDB binary is
> not downloaded during the Render build.

### Vercel (web)

1. Import the repository, set **Root Directory** to `web`.
2. Framework preset: Next.js. Build `npm run build`, output handled by Vercel.
3. Environment variable: `NEXT_PUBLIC_API_URL=https://<render-service>.onrender.com`.
4. Deploy, then add the Vercel URL to the API's `CORS_ORIGINS` and redeploy the API.

> **Credential hygiene.** `.env` / `.env.local` are gitignored and must never be
> committed. Store the real Atlas URI only in your local `.env` and in Render's
> environment settings; the committed `.env.example` keeps the `<db_password>`
> placeholder. Use a least-privilege database user (e.g. `readWrite` on
> `path_point` only) rather than an Atlas admin, keep the network allowlist as
> narrow as the deployment allows, and rotate any password that has ever been
> shared in plain text.

---

## Block tracker

| Block | Scope | Status |
|---|---|---|
| 0 | Scaffold, env validation, Mongo connect, middleware chain, error envelope, docs, health, tests | ✅ |
| 1 | User model, register/login/me, JWT + bcrypt, auth guards | ✅ |
| 2 | Rides CRUD, ownership, `2dsphere` indexes, Dhaka/Chattogram seed | ✅ |
| 3 | Geospatial matching (`$geoNear` + `$geoWithin` + scoring) | ✅ |
| 4 | Ride requests, bookings with atomic seat reservation | ✅ |
| 5 | SSE `SseHub`, traffic events, simulator | ✅ |
| 6 | Next.js dashboard (login, search, dashboard, ride detail) | ✅ |
| 7 | Deployment blueprints, demo script, README polish | ✅ |

### Known limitations / next steps

- Bearer-only auth (no refresh rotation); token lives in `localStorage`.
- Traffic events are in-memory (single instance); a multi-instance deployment
  would need Redis pub/sub or a capped Mongo collection.
- `Last-Event-ID` replay is not implemented.
- Payment, ratings and notifications are out of scope for this phase.
