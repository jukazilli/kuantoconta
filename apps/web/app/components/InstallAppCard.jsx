"use client";

import { Download, CheckCircle2, Smartphone, Share } from "lucide-react";
import { usePwa } from "./PwaProvider";

export default function InstallAppCard() {
  const { isStandalone, canInstall, platform, installState, promptInstall } = usePwa();

  return (
    <section className="card panel pwa-install-card" aria-labelledby="pwa-install-title">
      <div className="pwa-install-head">
        <div className="pwa-install-icon" aria-hidden="true">
          {isStandalone ? <CheckCircle2 size={20} /> : <Smartphone size={20} />}
        </div>
        <div>
          <h3 id="pwa-install-title">Aplicativo instalável (PWA)</h3>
          <p className="hint" style={{ margin: "4px 0 0" }}>
            {isStandalone
              ? "Você já está usando o kuantoconta em modo aplicativo."
              : "Instale o kuantoconta na tela inicial para abrir em tela cheia, com acesso rápido e seguro."}
          </p>
        </div>
      </div>

      {isStandalone ? (
        <div className="pwa-install-status">
          <span className="pwa-status-chip">Instalado neste dispositivo</span>
        </div>
      ) : canInstall ? (
        <div className="pwa-install-actions">
          <button
            type="button"
            className="pill pill-primary"
            disabled={installState === "prompting"}
            onClick={() => promptInstall()}
          >
            <Download size={16} aria-hidden="true" />
            {installState === "prompting" ? "Abrindo instalação..." : "Instalar aplicativo"}
          </button>
        </div>
      ) : platform === "ios" ? (
        <div className="pwa-ios-steps">
          <p className="pwa-ios-step">
            <Share size={15} aria-hidden="true" />
            <span>
              No Safari, toque em <strong>Compartilhar</strong> e depois em{" "}
              <strong>Adicionar à Tela de Início</strong>.
            </span>
          </p>
        </div>
      ) : (
        <p className="hint" style={{ margin: 0 }}>
          Use o ícone de instalação na barra de endereço do navegador (Chrome, Edge ou Android) para
          adicionar o kuantoconta ao seu dispositivo.
        </p>
      )}
    </section>
  );
}
