import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { usersRepo } from "@/lib/server/users.repo";

const registerSchema = z
  .object({
    name: z.string().min(2).max(120),
    email: z.string().email(),
    password: z.string().min(6).max(120),
    confirmPassword: z.string().min(6).max(120)
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas nao conferem",
    path: ["confirmPassword"]
  });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const payload = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();

  const existingUser = usersRepo.findByEmail(email);

  if (existingUser) {
    return NextResponse.json(
      {
        error: {
          message: "Email ja cadastrado"
        }
      },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const user = usersRepo.create({
    name: parsed.data.name.trim(),
    email,
    password: passwordHash
  });

  if (!user) {
    return NextResponse.json({ error: "Falha ao criar usuario" }, { status: 500 });
  }

  const responsePayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  };

  return NextResponse.json(responsePayload, { status: 201 });
}


