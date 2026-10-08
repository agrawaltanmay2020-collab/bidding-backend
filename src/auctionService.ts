import { randomUUID } from "node:crypto";
import { PoolClient } from "pg";
import { withTransaction } from "./db";
import { AuctionState, Bid } from "./types";

function mapAuction(row: any): AuctionState {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    currentHighestBid: Number(row.current_highest_bid),
    highestBidderId: row.highest_bidder_id,
    version: Number(row.version),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function mapBid(row: any): Bid {
  return {
    id: row.id,
    auctionId: row.auction_id,
    bidderId: row.bidder_id,
    amount: Number(row.amount),
    createdAt: new Date(row.created_at).toISOString()
  };
}

export async function createAuction(
  title: string,
  startingBid = 0
): Promise<AuctionState> {
  const id = randomUUID();
  const result = await withTransaction(async (client) => {
    const query = `
      INSERT INTO auctions (id, title, current_highest_bid)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const { rows } = await client.query(query, [id, title, startingBid]);
    return mapAuction(rows[0]);
  });
  return result;
}

export async function getAuction(id: string): Promise<AuctionState | null> {
  const { rows } = await (await import("./db")).pool.query(
    "SELECT * FROM auctions WHERE id = $1",
    [id]
  );
  return rows[0] ? mapAuction(rows[0]) : null;
}

export async function listBids(id: string): Promise<Bid[]> {
  const { rows } = await (await import("./db")).pool.query(
    `SELECT * FROM bids WHERE auction_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [id]
  );
  return rows.map(mapBid);
}

export async function placeBid(
  auctionId: string,
  bidderId: string,
  amount: number
): Promise<{ auction: AuctionState; bid: Bid }> {
  return withTransaction(async (client: PoolClient) => {
    const locked = await client.query(
      `SELECT * FROM auctions WHERE id = $1 FOR UPDATE`,
      [auctionId]
    );

    if (locked.rowCount === 0) {
      throw new Error("AUCTION_NOT_FOUND");
    }

    const auction = locked.rows[0];

    if (auction.status !== "OPEN") {
      throw new Error("AUCTION_CLOSED");
    }

    const current = Number(auction.current_highest_bid);

    if (amount <= current) {
      throw new Error("BID_TOO_LOW");
    }

    const bidId = randomUUID();

    const bidResult = await client.query(
      `
      INSERT INTO bids (id, auction_id, bidder_id, amount)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [bidId, auctionId, bidderId, amount]
    );

    const updated = await client.query(
      `
      UPDATE auctions
      SET current_highest_bid = $2,
          highest_bidder_id = $3,
          version = version + 1,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [auctionId, amount, bidderId]
    );

    return {
      auction: mapAuction(updated.rows[0]),
      bid: mapBid(bidResult.rows[0])
    };
  });
}
