import { Hono } from "hono";

export function createHttpServer() {
  const app = new Hono();

  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: Date.now() });
  });

  return app;
}
