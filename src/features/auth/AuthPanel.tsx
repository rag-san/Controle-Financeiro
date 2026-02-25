"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import { Button } from "@/src/components/ui/Button";
import { FeedbackMessage } from "@/src/components/ui/FeedbackMessage";
import { FormField } from "@/src/components/ui/FormField";
import { Input } from "@/src/components/ui/Input";
import { useToast } from "@/src/components/ui/ToastProvider";

type AuthMode = "signin" | "signup";
type FieldErrors = Partial<Record<"name" | "email" | "password" | "confirmPassword", string>>;

export function AuthPanel(): React.JSX.Element {
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = React.useState<AuthMode>("signin");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});

  const resetAuthState = React.useCallback((nextMode: AuthMode) => {
    setError("");
    setFieldErrors({});
    setMode(nextMode);
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    if (nextMode === "signup") {
      setName("");
    }
  }, []);

  const validateSignup = (): FieldErrors => {
    const nextErrors: FieldErrors = {};

    if (name.trim().length < 2) {
      nextErrors.name = "Informe um nome com pelo menos 2 caracteres.";
    }
    if (!email.includes("@")) {
      nextErrors.email = "Informe um email valido.";
    }
    if (password.length < 6) {
      nextErrors.password = "A senha deve ter pelo menos 6 caracteres.";
    }
    if (confirmPassword !== password) {
      nextErrors.confirmPassword = "As senhas precisam ser iguais.";
    }

    return nextErrors;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setFieldErrors({});

    if (mode === "signup") {
      const validationErrors = validateSignup();
      if (Object.keys(validationErrors).length > 0) {
        setLoading(false);
        setFieldErrors(validationErrors);
        setError("Corrija os campos destacados para continuar.");
        toast({ variant: "error", title: "Cadastro inválido", description: "Revise os campos do formulário." });
        return;
      }

      try {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password, confirmPassword })
        });

        const { data, errorMessage } = await parseApiResponse<{ error?: unknown }>(response);

        if (errorMessage) {
          setLoading(false);
          setError(errorMessage);
          toast({ variant: "error", title: "Falha no cadastro", description: errorMessage });
          return;
        }

        if (!response.ok) {
          const message = extractApiError(data, "Não foi possível criar a conta");
          setLoading(false);
          setError(message);
          toast({ variant: "error", title: "Falha no cadastro", description: message });
          return;
        }

        toast({ variant: "success", title: "Conta criada", description: "Entrando automaticamente..." });
      } catch {
        setLoading(false);
        setError("Falha de rede ao criar conta.");
        toast({ variant: "error", title: "Falha de rede", description: "Não foi possível criar a conta." });
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
      const message =
        result.error === "CredentialsSignin" ? "Email ou senha inválidos" : "Não foi possível fazer login.";
      setError(message);
      toast({ variant: "error", title: "Falha no login", description: message });
      return;
    }

    toast({ variant: "success", title: "Login realizado", description: "Redirecionando para o dashboard." });
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{mode === "signin" ? "Entrar" : "Criar conta"}</CardTitle>
        <CardDescription id="auth-panel-description">
          {mode === "signin"
            ? "Use seu acesso para continuar no dashboard financeiro."
            : "Crie um novo acesso para entrar no dashboard financeiro."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" aria-describedby="auth-panel-description" aria-busy={loading}>
          {mode === "signup" ? (
            <FormField id="auth-name" label="Nome" required error={fieldErrors.name}>
              {(fieldProps) => <Input {...fieldProps} value={name} onChange={(event) => setName(event.target.value)} />}
            </FormField>
          ) : null}

          <FormField id="auth-email" label="Email" required error={fieldErrors.email}>
            {(fieldProps) => <Input {...fieldProps} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />}
          </FormField>

          <FormField id="auth-password" label="Senha" required error={fieldErrors.password}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </FormField>

          {mode === "signup" ? (
            <FormField
              id="auth-confirm-password"
              label="Confirmar senha"
              required
              error={fieldErrors.confirmPassword}
            >
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              )}
            </FormField>
          ) : null}

          {error ? <FeedbackMessage variant="error">{error}</FeedbackMessage> : null}

          <Button type="submit" className="w-full" isLoading={loading} disabled={loading}>
            {loading
              ? mode === "signin"
                ? "Entrando..."
                : "Criando..."
              : mode === "signin"
                ? "Entrar"
                : "Criar conta"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => resetAuthState(mode === "signin" ? "signup" : "signin")}
            disabled={loading}
          >
            {mode === "signin" ? "Não tem conta? Criar agora" : "Já tem conta? Entrar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}


