"use client";
import { useState } from "react";

export default function AuthorizeConsent({ user, clientName, validationError, oauthParams }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(validationError || "");

  async function decide(decision) {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...oauthParams, decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.redirectTo) {
        throw new Error(data.error || "Não foi possível concluir a autorização.");
      }
      window.location.assign(data.redirectTo);
    } catch (e) {
      setErr(e?.message || "Erro ao autorizar.");
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "var(--kc-bg)" }}>
      <div className="dialog" style={{ width: "min(480px, 100%)", display: "grid", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="brand-mark">k</span>
          <div>
            <div className="eyebrow">CONEXÃO SEGURA · OAUTH 2.1</div>
            <h1 style={{ margin: 0, fontSize: 20 }}>Conectar {clientName}</h1>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: 14, color: "var(--kc-muted-dark)", lineHeight: 1.5 }}>
          Você está conectado como <strong>{user.email}</strong>. Ao autorizar, <strong>{clientName}</strong> poderá:
        </p>

        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 13, color: "var(--kc-ink)" }}>
          <li>Consultar seus saldos, lançamentos, limites mensais e diagnóstico de saúde financeira.</li>
          <li>Simular compras parceladas e planos de economia.</li>
          <li>Registrar lançamentos, baixas, limites e metas quando você pedir na conversa.</li>
        </ul>

        <p className="hint" style={{ margin: 0 }}>
          Você pode revogar este acesso a qualquer momento na aba <strong>Perfil</strong> do KuantoConta.
        </p>

        {err && <div className="onboarding-error" role="alert">{err}</div>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
          <button type="button" className="pill pill-secondary" disabled={busy || Boolean(validationError)} onClick={() => decide("deny")}>
            Cancelar
          </button>
          <button type="button" className="pill pill-primary" disabled={busy || Boolean(validationError)} onClick={() => decide("approve")}>
            {busy ? "Autorizando..." : "Autorizar acesso"}
          </button>
        </div>
      </div>
    </main>
  );
}
