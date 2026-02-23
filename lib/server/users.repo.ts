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
    const row = (await db
      .prepare(
        `SELECT id, email, name, password, role, created_at, updated_at
         FROM users
         WHERE email = ?`
      )
      .get(email)) as UserRow | undefined;

    return row ? mapUser(row) : null;
  },

  async create(input: { email: string; name: string; password: string | null; role?: "user" | "admin" }) {
    const id = createId();
    const now = nowIso();

    await db.prepare(
      `INSERT INTO users (id, email, name, password, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, input.email, input.name, input.password, input.role ?? "user", now, now);

    return this.findById(id);
  }
};



