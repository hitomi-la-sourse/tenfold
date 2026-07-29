"use client";

import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@tenfold/shared";

let singleton: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function gameSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!singleton) {
    singleton = io(process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://localhost:3001", {
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
  }
  return singleton;
}
