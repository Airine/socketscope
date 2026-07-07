import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getAllSessions, getSessionCommands, getSession } from "../websocket";

export const sessionRouter = createRouter({
  list: publicQuery.query(() => {
    return getAllSessions();
  }),

  getById: publicQuery
    .input(z.object({ sessionId: z.string() }))
    .query(({ input }) => {
      const session = getSession(input.sessionId);
      if (!session) return null;
      return {
        sessionId: session.sessionId,
        pageTitle: session.pageTitle,
        pageUrl: session.pageUrl,
        peerCount: session.peerCount,
        status: session.controllerSocket ? "connected" : "disconnected",
        createdAt: session.createdAt,
        lastHeartbeat: session.lastHeartbeat,
      };
    }),

  commands: publicQuery
    .input(z.object({ sessionId: z.string() }))
    .query(({ input }) => {
      return getSessionCommands(input.sessionId);
    }),

  stats: publicQuery.query(() => {
    const sessions = getAllSessions();
    const totalCommands = sessions.reduce(
      (sum, s) => sum + (getSessionCommands(s.sessionId).length),
      0
    );
    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter((s) => s.status === "connected").length,
      totalPeers: sessions.reduce((sum, s) => sum + s.peerCount, 0),
      totalCommands,
      avgLatency: sessions.length > 0
        ? Math.round(
            sessions.reduce((sum, s) => sum + (s.avgLatency || 0), 0) /
              sessions.length
          )
        : 0,
    };
  }),
});
