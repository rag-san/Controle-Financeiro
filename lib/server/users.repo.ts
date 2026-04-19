import { db } from "@/lib/db";
import { createId } from "@/lib/db";
import { nowIso } from "@/lib/server/sql";

type UserRow = {
  id: string;
  email: string;
  name: string;
  password: string | null;
  role: "user" | "admin";
  created_at: string;
  updated_at: string;
};

function mapUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    password: row.password,
    role: row.role,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function normalizeUserEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const usersRepo = {
  async findById(id: string) {
    const row = (await db
      .prepare(
        `SELECT id, email, name, password, role, created_at, updated_at
         FROM users
         WHERE id = ?`
      )
      .get(id)) as UserRow | undefined;

    return row ? mapUser(row) : null;
  },

  async findByEmail(email: string) {
    const normalizedEmail = normalizeUserEmail(email);
    const row = (await db
      .prepare(
        `SELECT id, email, name, password, role, created_at, updated_at
         FROM users
         WHERE LOWER(email) = ?`
      )
      .get(normalizedEmail)) as UserRow | undefined;

    return row ? mapUser(row) : null;
  },

  async create(input: { email: string; name: string; password: string | null; role?: "user" | "admin" }) {
    const id = createId();
    const now = nowIso();
    const normalizedEmail = normalizeUserEmail(input.email);

    await db.prepare(
      `INSERT INTO users (id, email, name, password, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, normalizedEmail, input.name.trim(), input.password, input.role ?? "user", now, now);

    return this.findById(id);
  }
};



