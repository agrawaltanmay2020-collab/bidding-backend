import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { z } from "zod";
import { createAuction, getAuction, listBids } from "./auctionService";
import { attachWebSocket } from "./realtime";

const app = express();
const server = createServer(app);

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/auctions", async (req, res) => {
  const schema = z.object({
    title: z.string().min(1).max(200),
    startingBid: z.number().nonnegative().default(0)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    return;
  }

  try {
    const auction = await createAuction(parsed.data.title, parsed.data.startingBid);
    res.status(201).json(auction);
  } catch {
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

app.get("/auctions/:id", async (req, res) => {
  try {
    const auction = await getAuction(req.params.id);
    if (!auction) {
      res.status(404).json({ error: "AUCTION_NOT_FOUND" });
      return;
    }
    res.json(auction);
  } catch {
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

app.get("/auctions/:id/bids", async (req, res) => {
  try {
    const auction = await getAuction(req.params.id);
    if (!auction) {
      res.status(404).json({ error: "AUCTION_NOT_FOUND" });
      return;
    }
    res.json(await listBids(req.params.id));
  } catch {
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

attachWebSocket(server);

const port = Number(process.env.PORT ?? 3000);

server.listen(port, () => {
  console.log(`HTTP + WebSocket server listening on http://localhost:${port}`);
  console.log(`WebSocket endpoint: ws://localhost:${port}/ws`);
});
