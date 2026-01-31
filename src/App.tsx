import { useEffect, useMemo, useState } from "react";
import "./App.css";

const lineSeries = [12, 18, 14, 28, 24, 32, 29, 36, 30, 38, 34, 42];
const accounts = [
  { name: "Caixa", type: "Conta corrente", balance: 1250.45, color: "#2563eb" },
  { name: "Itaú", type: "Conta corrente", balance: 3790.6, color: "#f97316" },
  { name: "Nubank", type: "Conta digital", balance: 1280.78, color: "#7c3aed" },
  { name: "Inter", type: "Conta digital", balance: 950.0, color: "#0ea5e9" },
];

const categories = [
  { name: "Alimentação", percent: 35, value: 1320.5, color: "#f97316" },
  { name: "Educação", percent: 22, value: 820.0, color: "#2563eb" },
  { name: "Moradia", percent: 19, value: 720.0, color: "#22c55e" },
  { name: "Investimentos", percent: 24, value: 910.3, color: "#14b8a6" },
];

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("cf_theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = stored ? stored === "dark" : prefersDark;
    setIsDarkMode(initial);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("theme-dark", isDarkMode);
    localStorage.setItem("cf_theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  const linePath = useMemo(() => {
    const max = Math.max(...lineSeries);
    const min = Math.min(...lineSeries);
    const range = max - min || 1;
    return lineSeries
      .map((value, index) => {
        const x = (index / (lineSeries.length - 1)) * 100;
        const y = 100 - ((value - min) / range) * 100;
        return `${x},${y}`;
      })
      .join(" ");
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar__logo">
          <span className="sidebar__logo-icon">$</span>
          Controle
        </div>
        <nav className="sidebar__nav">
          <button className="sidebar__item sidebar__item--active">Visão geral</button>
          <button className="sidebar__item">Transações</button>
          <button className="sidebar__item">Carteiras</button>
          <button className="sidebar__item">Metas</button>
          <button className="sidebar__item">Relatórios</button>
        </nav>
      </aside>

      <div className="dashboard">
        <header className="dashboard__header">
          <div>
            <p className="dashboard__eyebrow">Olá, João</p>
            <h1 className="dashboard__title">Seu panorama financeiro</h1>
            <p className="dashboard__subtitle">
              Você tem contas a pagar hoje no total de <strong>R$ 313,50</strong>.
            </p>
          </div>
          <div className="dashboard__actions">
            <button className="ghost-button">Exportar</button>
            <button className="primary-button">+ Nova movimentação</button>
            <button
              className="ghost-button"
              onClick={() => setIsDarkMode((prev) => !prev)}
            >
              {isDarkMode ? "Modo claro" : "Modo escuro"}
            </button>
          </div>
        </header>

        <main className="dashboard__grid">
          <section className="card card--highlight">
            <div className="card__header">
              <div>
                <p className="card__eyebrow">Saldo atual</p>
                <h2 className="card__value">{formatBRL(36218.95)}</h2>
                <p className="card__hint">Receitas no mês: {formatBRL(8546.1)}</p>
              </div>
              <div className="pill pill--success">+ 12,5%</div>
            </div>
            <div className="line-chart">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <polyline
                  points={linePath}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="3"
                />
              </svg>
              <div className="line-chart__fade" />
            </div>
          </section>

          <section className="status-grid">
            {[
              {
                title: "Recebimentos",
                value: 8546.1,
                note: "Neste mês",
                tone: "success",
              },
              {
                title: "Vencimentos",
                value: 0,
                note: "Pagos",
                tone: "info",
              },
              {
                title: "Despesas",
                value: -2456.58,
                note: "Em até 15 dias",
                tone: "danger",
              },
            ].map((item) => (
              <div key={item.title} className="card status-card">
                <div className={`status-card__icon status-card__icon--${item.tone}`}>
                  <span>◉</span>
                </div>
                <div>
                  <p className="card__eyebrow">{item.title}</p>
                  <h3 className={`status-card__value status-card__value--${item.tone}`}>
                    {formatBRL(item.value)}
                  </h3>
                  <p className="card__hint">{item.note}</p>
                </div>
              </div>
            ))}
          </section>

          <section className="card accounts">
            <div className="card__header">
              <div>
                <h3 className="card__title">Saldo das contas</h3>
                <p className="card__hint">Atualizado há 2 minutos</p>
              </div>
              <button className="ghost-button">Ver todas</button>
            </div>
            <div className="accounts__list">
              {accounts.map((account) => (
                <div key={account.name} className="accounts__item">
                  <div className="accounts__info">
                    <div
                      className="accounts__icon"
                      style={{ backgroundColor: account.color }}
                    >
                      {account.name.slice(0, 2)}
                    </div>
                    <div>
                      <p className="accounts__name">{account.name}</p>
                      <p className="card__hint">{account.type}</p>
                    </div>
                  </div>
                  <strong>{formatBRL(account.balance)}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="card categories">
            <div className="card__header">
              <div>
                <h3 className="card__title">Principais categorias</h3>
                <p className="card__hint">Distribuição dos gastos no mês</p>
              </div>
              <button className="ghost-button">Detalhes</button>
            </div>
            <div className="categories__list">
              {categories.map((category) => (
                <div key={category.name} className="categories__item">
                  <div className="categories__row">
                    <span>{category.name}</span>
                    <span>{formatBRL(category.value)}</span>
                  </div>
                  <div className="categories__bar">
                    <span
                      style={{
                        width: `${category.percent}%`,
                        backgroundColor: category.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
