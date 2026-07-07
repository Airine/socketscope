import { createRouter, publicQuery } from "./middleware";
import { sessionRouter } from "./routers/session";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  session: sessionRouter,
});

export type AppRouter = typeof appRouter;
