import {
  mysqlTable,
  serial,
  varchar,
  text,
  timestamp,
  int,
  mysqlEnum,
} from "drizzle-orm/mysql-core";

export const sessions = mysqlTable("sessions", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull().unique(),
  pageTitle: varchar("page_title", { length: 512 }),
  pageUrl: varchar("page_url", { length: 2048 }),
  status: mysqlEnum("status", ["connected", "disconnected", "error"]).notNull().default("connected"),
  peerCount: int("peer_count").notNull().default(0),
  avgLatency: int("avg_latency").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const commands = mysqlTable("commands", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  peerId: varchar("peer_id", { length: 64 }),
  commandType: varchar("command_type", { length: 32 }).notNull(),
  payload: text("payload"),
  status: mysqlEnum("status", ["pending", "success", "error"]).notNull().default("pending"),
  duration: int("duration"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
