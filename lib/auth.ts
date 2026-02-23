import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { clearRateLimit, consumeRateLimit } from "@/lib/rate-limit";
import { usersRepo } from "@/lib/server/users.repo";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 8;
const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/login"
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" }
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          return null;
        }

        const normalizedEmail = parsed.data.email.toLowerCase().trim();
        const rateLimitKey = `auth:login:${normalizedEmail}`;
        const rateLimit = consumeRateLimit({
          key: rateLimitKey,
          limit: LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
          windowMs: LOGIN_RATE_LIMIT_WINDOW_MS
        });

        if (!rateLimit.ok) {
          return null;
        }

        const user = await usersRepo.findByEmail(normalizedEmail);

        if (!user?.password) {
          return null;
        }

        const validPassword = await bcrypt.compare(parsed.data.password, user.password);
        if (!validPassword) {
          return null;
        }

        clearRateLimit(rateLimitKey);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.email = token.email ?? session.user.email;
        session.user.name = token.name ?? session.user.name;
        session.user.role = token.role;
      }
      return session;
    }
  }
};

export async function getRequiredUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

