/**
 * Database schema.
 *
 * Rules for changing it (see docs/SCHEMA.md):
 *  - Every change is a new migration generated with `npm run db:generate`.
 *  - Changes are additive: new columns are nullable or have a default.
 *    Never rename or drop a column in place.
 *  - Enumerated values are plain text columns (not Postgres enums), so a new
 *    value never needs a migration of existing data.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () => integer("id").primaryKey().generatedAlwaysAsIdentity();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const SHELF_KINDS = ["books", "toys", "notes", "albums", "other"] as const;
export const BOOK_STATUSES = ["shelf", "reading", "lent", "missing"] as const;
export const LOAN_KINDS = ["reading", "lent"] as const;
export const USER_ROLES = ["admin", "member"] as const;
export const LANGUAGES = ["es", "en", "fr", "de", "other"] as const;

/** Family members. In passcode mode they pick their name; in account mode they sign in. */
export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email"),
    role: text("role", { enum: USER_ROLES }).notNull().default("member"),
    locale: text("locale").notNull().default("es"),
    active: integer("active").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`)],
);

/** A room or area: Pasillo, Pasillo Sótano, Salón Sótano, Habitación 2… */
export const rooms = pgTable("rooms", {
  id: id(),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
  notes: text("notes"),
  createdAt: createdAt(),
});

/** A piece of furniture inside a room. `sort` = position left → right. */
export const bookcases = pgTable(
  "bookcases",
  {
    id: id(),
    roomId: integer("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("bookcases_room_idx").on(t.roomId)],
);

/**
 * One level of a bookcase. `sort` = position top → bottom.
 * `heightUnits` lets a tall level (e.g. the toys level) be drawn taller.
 * A front row (e.g. 2B) is its own shelf with `frontOfShelfId` pointing at the back row.
 */
export const shelves = pgTable(
  "shelves",
  {
    id: id(),
    bookcaseId: integer("bookcase_id")
      .notNull()
      .references(() => bookcases.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    sort: integer("sort").notNull().default(0),
    heightUnits: integer("height_units").notNull().default(1),
    kind: text("kind", { enum: SHELF_KINDS }).notNull().default("books"),
    frontOfShelfId: integer("front_of_shelf_id").references(
      (): AnyPgColumn => shelves.id,
      { onDelete: "restrict" },
    ),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("shelves_bookcase_idx").on(t.bookcaseId)],
);

/** The groups used to organize the library, in both languages. */
export const themes = pgTable(
  "themes",
  {
    id: id(),
    nameEs: text("name_es").notNull(),
    nameEn: text("name_en").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("themes_name_es_unique").on(t.nameEs)],
);

export const books = pgTable(
  "books",
  {
    id: id(),
    title: text("title").notNull(),
    author: text("author"),
    language: text("language", { enum: LANGUAGES }).notNull().default("es"),
    themeId: integer("theme_id").references(() => themes.id, {
      onDelete: "set null",
    }),
    series: text("series"),
    seriesNumber: real("series_number"),
    notes: text("notes"),

    /**
     * Where the book belongs, and its place in the row (left → right).
     * Always set for live books; may be null only for deleted books whose shelf was removed.
     */
    homeShelfId: integer("home_shelf_id").references(() => shelves.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),

    /** Where the book is right now. */
    status: text("status", { enum: BOOK_STATUSES }).notNull().default("shelf"),
    /** Person reading or borrowing it (typed name). */
    holder: text("holder"),
    /** Room it is being read in, when status = reading. */
    statusRoomId: integer("status_room_id").references(() => rooms.id, {
      onDelete: "set null",
    }),
    statusSince: timestamp("status_since", { withTimezone: true }),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: integer("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Soft delete: the book disappears from the app but its loan history is kept. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("books_home_shelf_idx").on(t.homeShelfId, t.position),
    index("books_status_idx").on(t.status),
  ],
);

/** Every time a book leaves its shelf: reading at home or lent out. Never deleted. */
export const loans = pgTable(
  "loans",
  {
    id: id(),
    bookId: integer("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "restrict" }),
    kind: text("kind", { enum: LOAN_KINDS }).notNull(),
    person: text("person").notNull(),
    roomId: integer("room_id").references(() => rooms.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedBy: integer("started_by").references(() => users.id, {
      onDelete: "set null",
    }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endedBy: integer("ended_by").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Shelf the book was put back on (normally its home shelf). */
    returnedToShelfId: integer("returned_to_shelf_id").references(
      () => shelves.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
  },
  (t) => [
    index("loans_book_idx").on(t.bookId),
    index("loans_open_idx").on(t.endedAt),
  ],
);

/** Audit log: who changed what, with before/after snapshots. */
export const events = pgTable(
  "events",
  {
    id: id(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorId: integer("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id"),
    data: jsonb("data"),
  },
  (t) => [
    index("events_at_idx").on(t.at),
    index("events_entity_idx").on(t.entityType, t.entityId),
  ],
);

// ───────────────────────────── Sign-in ─────────────────────────────

/** A signed-in phone. The cookie holds a random token; only its SHA-256 is stored. */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    tokenHash: text("token_hash").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    method: text("method").notNull(), // passcode | email | google | dev
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
  },
  (t) => [uniqueIndex("sessions_token_unique").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

/** One-time sign-in links sent by email. */
export const loginTokens = pgTable(
  "login_tokens",
  {
    id: id(),
    tokenHash: text("token_hash").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("login_tokens_token_unique").on(t.tokenHash)],
);

/** Failed sign-in attempts, to slow down guessing (per IP / per email). */
export const authAttempts = pgTable("auth_attempts", {
  key: text("key").primaryKey(),
  failures: integer("failures").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});
