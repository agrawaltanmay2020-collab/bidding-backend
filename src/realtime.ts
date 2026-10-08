import { WebSocketServer, WebSocket } from "ws";
import { Server } from "node:http";
import { ErrorEvent } from "./types";
import { getAuction, placeBid } from "./auctionService";

interface Client {
  socket: WebSocket;
  auctionId: string;
  bidderId: string;
}

const clients = new Map<string, Set<Client>>();

function send(socket: WebSocket, payload: unknown) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function broadcast(auctionId: string, payload: unknown) {
  const group = clients.get(auctionId);
  if (!group) return;

  for (const client of group) {
    send(client.socket, payload);
  }
}

function addClient(client: Client) {
  if (!clients.has(client.auctionId)) {
    clients.set(client.auctionId, new Set());
  }
  clients.get(client.auctionId)!.add(client);
}

function removeClient(client: Client) {
  const group = clients.get(client.auctionId);
  if (!group) return;
  group.delete(client);
  if (group.size === 0) clients.delete(client.auctionId);
}

export function attachWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (socket, request) => {
    const url = new URL(request.url ?? "", "http://localhost");
    const auctionId = url.searchParams.get("auctionId");
    const bidderId = url.searchParams.get("bidderId");

    if (!auctionId || !bidderId) {
      send(socket, {
        type: "error",
        code: "INVALID_CONNECTION",
        message: "auctionId and bidderId are required"
      } satisfies ErrorEvent);
      socket.close(1008);
      return;
    }

    const auction = await getAuction(auctionId);

    if (!auction) {
      send(socket, {
        type: "error",
        code: "AUCTION_NOT_FOUND",
        message: "Auction does not exist"
      } satisfies ErrorEvent);
      socket.close(1008);
      return;
    }

    const client: Client = { socket, auctionId, bidderId };
    addClient(client);
    send(socket, { type: "auction.snapshot", auction });

    socket.on("message", async (raw) => {
      try {
        const message = JSON.parse(raw.toString());

        if (message.type !== "bid") {
          send(socket, {
            type: "error",
            code: "INVALID_MESSAGE",
            message: "Supported message type: bid"
          } satisfies ErrorEvent);
          return;
        }

        const amount = Number(message.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          send(socket, {
            type: "error",
            code: "INVALID_AMOUNT",
            message: "amount must be a positive number"
          } satisfies ErrorEvent);
          return;
        }

        const result = await placeBid(auctionId, bidderId, amount);
        broadcast(auctionId, {
          type: "bid.accepted",
          auction: result.auction,
          bid: result.bid
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
        const messages: Record<string, string> = {
          AUCTION_NOT_FOUND: "Auction does not exist",
          AUCTION_CLOSED: "Auction is closed",
          BID_TOO_LOW: "Bid must be higher than the current highest bid"
        };

        send(socket, {
          type: "error",
          code,
          message: messages[code] ?? "Request failed"
        } satisfies ErrorEvent);
      }
    });

    socket.on("close", () => removeClient(client));
    socket.on("error", () => removeClient(client));
  });

  return wss;
}
