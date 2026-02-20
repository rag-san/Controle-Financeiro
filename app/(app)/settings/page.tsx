import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRequiredUserId } from "@/lib/auth";
import { usersRepo } from "@/lib/server/users.repo";

export default async function SettingsPage(): Promise<React.JSX.Element> {
  const userId = await getRequiredUserId();
  if (!userId) {
    redirect("/login");
  }

  const user = usersRepo.findById(userId);

  return (
    <PageShell title="Configuracoes" subtitle="Preferencias e dados da conta">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Conta autenticada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <strong>Nome:</strong> {user?.name ?? "-"}
            </p>
            <p>
              <strong>Email:</strong> {user?.email ?? "-"}
            </p>
            <p>
              <strong>Perfil:</strong> {user?.role ?? "user"}
            </p>
            <p>
              <strong>Criado em:</strong>{" "}
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString("pt-BR") : "-"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tema</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Use o botao de sol/lua no topo para alternar entre modo claro e escuro.
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

