export default function App() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ margin: 0 }}>Controle Financeiro</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        MVP: transações + resumo do mês
      </p>

      <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
        <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
          <strong>Saldo</strong>
          <div style={{ fontSize: 24, marginTop: 8 }}>R$ 0,00</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
            <strong>Entradas</strong>
            <div style={{ fontSize: 18, marginTop: 8 }}>R$ 0,00</div>
          </div>
          <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
            <strong>Saídas</strong>
            <div style={{ fontSize: 18, marginTop: 8 }}>R$ 0,00</div>
          </div>
        </div>

        <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
          <strong>Transações</strong>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            (Em breve: lista + botão “Nova transação”)
          </p>
        </div>
      </div>
    </div>
  );
}