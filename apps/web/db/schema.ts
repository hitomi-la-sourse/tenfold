import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const onlineRooms = sqliteTable("online_rooms", {
  code: text("code").primaryKey(),
  state: text("state").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
