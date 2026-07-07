import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createWebSocketServer } from "./websocket";
import type { Server } from "http";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

let wsServer: ReturnType<typeof createWebSocketServer> | null = null;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  const server = serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log(`WebSocket server running on ws://localhost:${port}/ws`);
  });

  wsServer = createWebSocketServer(server as Server);
} else {
  // Development: create a standalone WS server
  const { createServer } = await import("http");
  const devServer = createServer();
  wsServer = createWebSocketServer(devServer);
  const wsPort = parseInt(process.env.WS_PORT || "3001");
  devServer.listen(wsPort, () => {
    console.log(`WebSocket dev server running on ws://localhost:${wsPort}/ws`);
  });
}
