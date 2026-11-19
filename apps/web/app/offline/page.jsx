"use client";

import { WifiOff, RefreshCw } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="offline-shell">
      <section className="card offline-card" aria-labelledby="offline-title">
        <div className="offline-brand">
          <span className="brand-mark" aria-hidden="true">k</span>
          <span className="brand-name">kuantoconta</span>
        </div>

        <div className="offline-icon" aria-hidden="true">
          <WifiOff size={28} />
        </div>

        <h1 id="offline-title">Você está sem conexão</h1>
        <p className="hint">
          Por segurança e para manter seus saldos e projeções sempre exatos, o kuantoconta não armazena
          dados financeiros offline. Assim que a internet voltar, toque abaixo para continuar.
        </p>

        <div className="offline-actions">
          <button
            type="button"
            className="pill pill-primary"
            onClick={() => window.location.replace("/dashboard")}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Tentar novamente
          </button>
        </div>
      </section>
    </main>
  );
}
