"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";

export function LoginForm(): React.JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    setError("");

    if (mode === "signup") {
      try {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            password,
            confirmPassword
          })
        });

        const { data, errorMessage } = await parseApiResponse<{ error?: unknown }>(response);

        if (errorMessage) {
          setLoading(false);
          setError(errorMessage);
          return;
        }

        if (!response.ok) {
          setLoading(false);
          setError(extractApiError(data, "Nao foi possivel criar a conta"));
          return;
        }
      } catch {
        setLoading(false);
        setError("Falha de rede ao criar conta.");
        return;
      }
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false
    });

    setLoading(false);

    if (result?.error) {
      setError(
        result.error === "CredentialsSignin" ? "Email ou senha invalidos" : "Nao foi possivel fazer login."
      );
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{mode === "signin" ? "Entrar" : "Criar conta"}</CardTitle>
        <CardDescription>
          {mode === "signin"
            ? "Use seu acesso para continuar no dashboard financeiro."
            : "Crie um novo acesso para entrar no dashboard financeiro."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="name">
                Nome
              </label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="password">
              Senha
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {mode === "signup" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="confirmPassword">
                Confirmar senha
              </label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? mode === "signin"
                ? "Entrando..."
                : "Criando..."
              : mode === "signin"
                ? "Entrar"
                : "Criar conta"}
          </Button>

          <button
            type="button"
            className="w-full text-sm text-primary hover:underline"
            onClick={() => {
              setError("");
              setMode((current) => {
                const nextMode = current === "signin" ? "signup" : "signin";
                if (nextMode === "signup") {
                  setName("");
                  setEmail("");
                  setPassword("");
                  setConfirmPassword("");
                } else {
                  setEmail("");
                  setPassword("");
                  setConfirmPassword("");
                }
                return nextMode;
              });
            }}
          >
            {mode === "signin" ? "Nao tem conta? Criar agora" : "Ja tem conta? Entrar"}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}


