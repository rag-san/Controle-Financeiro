"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Github, Lock, Mail, User } from "lucide-react";
import { toast } from "sonner";
import { extractApiError, parseApiResponse } from "@/lib/client/api-response";
import { cn } from "@/src/app-shell/utils";

export function AuthPage(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setIsLoading(true);

    try {
      if (!isLogin) {
        const registerResponse = await fetch("/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name,
            email,
            password,
            confirmPassword
          })
        });

        const { data, errorMessage } = await parseApiResponse<{ error?: unknown }>(registerResponse);
        if (errorMessage) throw new Error(errorMessage);
        if (!registerResponse.ok) {
          throw new Error(extractApiError(data, "Nao foi possivel criar a conta."));
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false
      });

      if (result?.error) {
        throw new Error(result.error === "CredentialsSignin" ? "Email ou senha invalidos." : "Nao foi possivel entrar.");
      }

      toast.success(isLogin ? "Login realizado" : "Conta criada com sucesso");
      router.push(callbackUrl);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na autenticacao.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute left-[-10%] top-[-20%] h-[50%] w-[50%] rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-20%] right-[-10%] h-[50%] w-[50%] rounded-full bg-info/10 blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">FinanceApp</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLogin ? "Bem-vindo de volta" : "Comece a controlar suas financas"}
          </p>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-2xl sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent" />

          <div className="relative mb-8 flex rounded-xl border border-border bg-secondary p-1">
            <div
              className={cn(
                "absolute inset-y-1 w-[calc(50%-4px)] rounded-lg bg-card transition-all duration-300 ease-out shadow-sm",
                isLogin ? "left-1" : "left-[calc(50%+3px)]"
              )}
            />
            <button
              onClick={() => setIsLogin(true)}
              className={cn(
                "relative z-10 flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
                isLogin ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              type="button"
            >
              Entrar
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={cn(
                "relative z-10 flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
                !isLogin ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              type="button"
            >
              Criar Conta
            </button>
          </div>

          <form onSubmit={handleSubmit} className="relative z-10 space-y-4">
            {!isLogin ? (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -10 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-1.5"
              >
                <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nome completo</label>
                <div className="group relative">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/70 transition-colors group-focus-within:text-primary" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Seu nome"
                    className="w-full rounded-xl border border-border bg-secondary py-3 pl-11 pr-4 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/50"
                  />
                </div>
              </motion.div>
            ) : null}

            <div className="space-y-1.5">
              <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">E-mail</label>
              <div className="group relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/70 transition-colors group-focus-within:text-primary" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="seu@email.com"
                  className="w-full rounded-xl border border-border bg-secondary py-3 pl-11 pr-4 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/50"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Senha</label>
              <div className="group relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/70 transition-colors group-focus-within:text-primary" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-border bg-secondary py-3 pl-11 pr-4 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/50"
                />
              </div>
            </div>

            {!isLogin ? (
              <div className="space-y-1.5">
                <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Confirmar senha</label>
                <div className="group relative">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/70 transition-colors group-focus-within:text-primary" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-border bg-secondary py-3 pl-11 pr-4 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/50"
                  />
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isLoading}
              className="group mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition-all duration-300 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary-foreground" />
              ) : (
                <>
                  {isLogin ? "Entrar na conta" : "Criar minha conta"}
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          <div className="relative z-10 mt-8">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative bg-card px-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                Ou continue com
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Login com Google ainda nao esta ativo."
                className="flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-border bg-secondary py-2.5 text-sm font-medium text-muted-foreground opacity-60"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
              </button>
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Login com GitHub ainda nao esta ativo."
                className="flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-border bg-secondary py-2.5 text-sm font-medium text-muted-foreground opacity-60"
              >
                <Github size={16} />
                GitHub
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
