import { relations } from "drizzle-orm";
import { sessions, commands } from "./schema";

export const sessionsRelations = relations(sessions, ({ many }) => ({
  commands: many(commands),
}));

export const commandsRelations = relations(commands, ({ one }) => ({
  session: one(sessions, {
    fields: [commands.sessionId],
    references: [sessions.sessionId],
  }),
}));
