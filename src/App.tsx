import { Card } from "./components/Card";

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Controle Financeiro</h1>
            <p className="text-sm text-slate-500">MVP · Entradas e Saídas</p>
          </div>

          <span className="text-xs rounded-full border px-3 py-1 text-slate-600">
            Janeiro
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6 space-y-6">
        <section className="grid gap-4 sm:grid-cols-3">
          <Card title="Saldo">
            <p className="text-2xl font-bold">R$ 0,00</p>
            <p className="mt-1 text-xs text-slate-500">Atual</p>
          </Card>

          <Card title="Entradas">
            <p className="text-xl font-semibold text-emerald-600">R$ 0,00</p>
            <p className="mt-1 text-xs text-slate-500">No mês</p>
          </Card>

          <Card title="Saídas">
            <p className="text-xl font-semibold text-rose-600">R$ 0,00</p>
            <p className="mt-1 text-xs text-slate-500">No mês</p>
          </Card>
        </section>

        <Card
          title="Transações"
          right={
            <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 active:bg-slate-900">
              + Nova
            </button>
          }
        >
          <div className="rounded-xl border border-dashed p-6 text-center">
            <p className="text-sm font-medium">Nenhuma transação ainda</p>
            <p className="mt-1 text-sm text-slate-500">
              Clique em <span className="font-semibold">+ Nova</span> para cadastrar a primeira.
            </p>
          </div>
        </Card>
      </main>
    </div>
  );
}
