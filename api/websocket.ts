import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { randomUUID } from "crypto";

// Message types
export interface WSMessage {
  type: string;
  payload?: Record<string, unknown>;
  timestamp?: number;
}

export interface SessionInfo {
  sessionId: string;
  pageTitle?: string;
  pageUrl?: string;
  controllerSocket?: WebSocket;
  peers: Map<string, WebSocket>;
  latencyHistory: number[];
  commandLog: CommandEntry[];
  createdAt: number;
  lastHeartbeat: number;
}

export interface CommandEntry {
  id: string;
  peerId: string;
  commandType: string;
  payload: string;
  status: "pending" | "success" | "error";
  duration?: number;
  errorMessage?: string;
  timestamp: number;
}

// In-memory session store
const sessions = new Map<string, SessionInfo>();

// Cleanup disconnected sessions every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (session.controllerSocket && session.controllerSocket.readyState !== WebSocket.OPEN) {
      session.controllerSocket = undefined;
    }
    for (const [peerId, ws] of session.peers.entries()) {
      if (ws.readyState !== WebSocket.OPEN) {
        session.peers.delete(peerId);
      }
    }
    if (now - session.lastHeartbeat > 60000 && !session.controllerSocket && session.peers.size === 0) {
      sessions.delete(sessionId);
    } else {
      session.peerCount = session.peers.size;
    }
  }
}, 30000);

export function createWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("sessionId");
    const peerId = url.searchParams.get("peerId") || randomUUID();
    const role = url.searchParams.get("role") || "peer";

    if (!sessionId) {
      ws.close(4001, "Missing sessionId");
      return;
    }

    let session = sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        peers: new Map(),
        latencyHistory: [],
        commandLog: [],
        createdAt: Date.now(),
        lastHeartbeat: Date.now(),
      };
      sessions.set(sessionId, session);
    }

    if (role === "controller") {
      session.controllerSocket = ws;
    } else {
      session.peers.set(peerId, ws);
      session.peerCount = session.peers.size;
    }

    send(ws, {
      type: "connected",
      payload: { sessionId, peerId, role, peerCount: session.peerCount },
    });

    if (role === "peer" && session.controllerSocket?.readyState === WebSocket.OPEN) {
      send(session.controllerSocket, {
        type: "peer_joined",
        payload: { peerId, peerCount: session.peerCount },
      });
    }

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WSMessage;
        handleMessage(ws, sessionId, peerId, role, msg);
      } catch {
        send(ws, { type: "error", payload: { message: "Invalid JSON" } });
      }
    });

    ws.on("close", () => {
      if (role === "controller") {
        session!.controllerSocket = undefined;
      } else {
        session!.peers.delete(peerId);
        session!.peerCount = session!.peers.size;
      }
      if (role === "peer" && session!.controllerSocket?.readyState === WebSocket.OPEN) {
        send(session!.controllerSocket, {
          type: "peer_left",
          payload: { peerId, peerCount: session!.peerCount },
        });
      }
    });

    ws.on("error", (err) => {
      console.error(`WebSocket error for ${sessionId}/${peerId}:`, err.message);
    });
  });

  return wss;
}

function send(ws: WebSocket, msg: WSMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ ...msg, timestamp: Date.now() }));
  }
}

function broadcast(session: SessionInfo, msg: WSMessage, excludePeerId?: string) {
  for (const [pid, ws] of session.peers) {
    if (pid !== excludePeerId) {
      send(ws, msg);
    }
  }
}

function handleMessage(
  ws: WebSocket,
  sessionId: string,
  peerId: string,
  role: string,
  msg: WSMessage
) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.lastHeartbeat = Date.now();

  switch (msg.type) {
    case "heartbeat": {
      send(ws, { type: "pong" });
      break;
    }
    case "rtt": {
      const rtt = msg.payload?.rtt as number;
      if (typeof rtt === "number") {
        session.latencyHistory.push(rtt);
        if (session.latencyHistory.length > 60) session.latencyHistory.shift();
        broadcast(session, {
          type: "rtt_update",
          payload: { rtt, avgRtt: getAvgRtt(session) },
        });
      }
      break;
    }
    case "page_info": {
      if (role === "controller") {
        session.pageTitle = msg.payload?.title as string;
        session.pageUrl = msg.payload?.url as string;
      }
      break;
    }
    case "command": {
      const commandType = msg.payload?.commandType as string;
      const commandPayload = JSON.stringify(msg.payload?.payload || {});
      const cmdId = randomUUID();
      const entry: CommandEntry = {
        id: cmdId,
        peerId,
        commandType: commandType || "unknown",
        payload: commandPayload,
        status: "pending",
        timestamp: Date.now(),
      };
      session.commandLog.push(entry);
      if (session.commandLog.length > 100) session.commandLog.shift();
      if (session.controllerSocket?.readyState === WebSocket.OPEN) {
        send(session.controllerSocket, {
          type: "execute_command",
          payload: { cmdId, commandType, payload: msg.payload?.payload, peerId },
        });
      }
      send(ws, { type: "command_queued", payload: { cmdId } });
      break;
    }
    case "command_result": {
      const cmdId = msg.payload?.cmdId as string;
      const result = msg.payload?.result as string;
      const duration = msg.payload?.duration as number;
      const error = msg.payload?.error as string;
      const entry = session.commandLog.find((c) => c.id === cmdId);
      if (entry) {
        entry.status = result === "success" ? "success" : "error";
        entry.duration = duration;
        entry.errorMessage = error;
      }
      const originPeerId = msg.payload?.peerId as string;
      const originPeer = session.peers.get(originPeerId);
      if (originPeer?.readyState === WebSocket.OPEN) {
        send(originPeer, {
          type: "command_result",
          payload: { cmdId, result, duration, error },
        });
      }
      break;
    }
    case "broadcast": {
      broadcast(session, {
        type: msg.payload?.eventType as string || "message",
        payload: msg.payload?.data as Record<string, unknown>,
      });
      break;
    }
    default: {
      if (role === "peer" && session.controllerSocket?.readyState === WebSocket.OPEN) {
        send(session.controllerSocket, { type: msg.type, payload: msg.payload });
      } else if (role === "controller") {
        broadcast(session, { type: msg.type, payload: msg.payload });
      }
    }
  }
}

function getAvgRtt(session: SessionInfo): number {
  if (session.latencyHistory.length === 0) return 0;
  const sum = session.latencyHistory.reduce((a, b) => a + b, 0);
  return Math.round(sum / session.latencyHistory.length);
}

export function getAllSessions() {
  const result = [];
  for (const [, session] of sessions) {
    result.push({
      sessionId: session.sessionId,
      pageTitle: session.pageTitle,
      pageUrl: session.pageUrl,
      peerCount: session.peerCount,
      avgLatency: getAvgRtt(session),
      status: session.controllerSocket ? "connected" : "disconnected",
      createdAt: session.createdAt,
      lastHeartbeat: session.lastHeartbeat,
    });
  }
  return result;
}

export function getSession(sessionId: string) {
  return sessions.get(sessionId);
}

export function getSessionCommands(sessionId: string) {
  const session = sessions.get(sessionId);
  return session?.commandLog || [];
}
