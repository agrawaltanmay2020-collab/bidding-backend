# Real-Time Bidding / Collaboration Backend

A production-style solution for the Web-BE2 assignment:

- Node.js + TypeScript
- PostgreSQL for durable shared state
- WebSockets (`ws`) for real-time updates
- PostgreSQL row locking (`SELECT ... FOR UPDATE`) for race-condition-safe bids
- REST endpoints for creating/reading auctions
- Reconnect/fresh-page support through a persisted database snapshot
- Docker Compose for PostgreSQL
- Vitest test

## Why TypeScript / Node.js?

TypeScript is a strong fit for this assignment because WebSockets are first-class in the Node.js ecosystem, the code is concise, and strict typing makes the real-time message protocol easier to maintain. PostgreSQL provides the transaction/locking guarantees the assignment explicitly asks for.

## Architecture

```text
Client A ──┐
Client B ──┼── WebSocket ──> Node.js ──> PostgreSQL
Client C ──┘                    │
                                └── broadcast after COMMIT
```

The database is the source of truth.

## Run locally

### 1. Start PostgreSQL

```bash
docker compose up -d postgres
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create environment file

```bash
cp .env.example .env
```

### 4. Run migration

```bash
npm run db:migrate
```

### 5. Start the server

Development:

```bash
npm run dev
```

Production-style:

```bash
npm run build
npm start
```

Server:

- HTTP: `http://localhost:3000`
- WebSocket: `ws://localhost:3000/ws`

## API

### Create auction

```bash
curl -X POST http://localhost:3000/auctions \
  -H "Content-Type: application/json" \
  -d '{"title":"MacBook Pro","startingBid":100}'
```

Example response:

```json
{
  "id": "8c9...",
  "title": "MacBook Pro",
  "status": "OPEN",
  "currentHighestBid": 100,
  "highestBidderId": null,
  "version": 0,
  "updatedAt": "2026-10-08T..."
}
```

### Get current persisted state

```bash
curl http://localhost:3000/auctions/<AUCTION_ID>
```

### Get recent bids

```bash
curl http://localhost:3000/auctions/<AUCTION_ID>/bids
```

## WebSocket protocol

Connect:

```text
ws://localhost:3000/ws?auctionId=<AUCTION_ID>&bidderId=alice
```

On connection, the server immediately sends:

```json
{
  "type": "auction.snapshot",
  "auction": {
    "id": "...",
    "title": "MacBook Pro",
    "status": "OPEN",
    "currentHighestBid": 100,
    "highestBidderId": null,
    "version": 0,
    "updatedAt": "..."
  }
}
```

Place a bid:

```json
{
  "type": "bid",
  "amount": 125
}
```

Accepted broadcast:

```json
{
  "type": "bid.accepted",
  "auction": { "...": "updated state" },
  "bid": {
    "id": "...",
    "auctionId": "...",
    "bidderId": "alice",
    "amount": 125,
    "createdAt": "..."
  }
}
```

Rejected bid:

```json
{
  "type": "error",
  "code": "BID_TOO_LOW",
  "message": "Bid must be higher than the current highest bid"
}
```

## Reconnect behavior

A client can disconnect and reconnect at any time. On a new WebSocket connection, the server reads the current auction from PostgreSQL and sends a fresh `auction.snapshot`.

A browser refresh therefore does not depend on old in-memory state.

## Testing

```bash
npm test
```

The main correctness property is implemented in the database transaction in `src/auctionService.ts`. For a full load test, run multiple clients that submit bids concurrently against the same auction and verify that:

- the final database value is the maximum accepted bid;
- lower/stale bids are rejected;
- every accepted bid exists in `bids`;
- all connected clients eventually receive the committed state.

