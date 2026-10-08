export type AuctionStatus = "OPEN" | "CLOSED";

export interface AuctionState {
  id: string;
  title: string;
  status: AuctionStatus;
  currentHighestBid: number;
  highestBidderId: string | null;
  version: number;
  updatedAt: string;
}

export interface Bid {
  id: string;
  auctionId: string;
  bidderId: string;
  amount: number;
  createdAt: string;
}

export interface BidAcceptedEvent {
  type: "bid.accepted";
  auction: AuctionState;
  bid: Bid;
}

export interface ErrorEvent {
  type: "error";
  code: string;
  message: string;
}
