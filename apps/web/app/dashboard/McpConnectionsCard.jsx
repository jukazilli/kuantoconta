"use client";
import { useEffect, useState } from "react";
import { Copy, Check, Link2, Trash2 } from "lucide-react";

export default function McpConnectionsCard() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(null);

  const mcpUrl = typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp";

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/oauth/connections", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      setConnections(Array.isArray(data.connections) ? data.connections : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function revoke(id) {
    setRevoking(id);
    try {
      await fetch("/api/oauth/connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await load();
    } finally {
      setRevoking(null);
    }
  }

  function copyUrl() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(mcpUrl).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <section className="card panel" style={{ display: "grid", gap: 14 }}>
      <div className="card-heading">
        <div>
          <div className="eyebrow">INTEGRAÇÃO POR CONVERSA</div>
          <h2 className="card-title">Conexões (ChatGPT / MCP)</h2>
        </div>
        <Link2 size={18} aria-hidden="true" />
      </div>

      <p className="hint" style={{ margin: 0 }}>
        Conecte sua conta no ChatGPT usando o endereço MCP abaixo (OAuth 2.1). Todas as ações seguem as mesmas regras do painel.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <code
          style={{
            flex: 1,
            minWidth: 200,
            padding: "10px 12px",
            borderRadius: 12,
            background: "var(--kc-surface-inner)",
            border: "1px solid var(--kc-line)",
            fontSize: 13,
            wordBreak: "break-all",
          }}
        >
          {mcpUrl}
        </code>
        <button type="button" className="pill pill-outline-orange pill-compact" onClick={copyUrl}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copiado" : "Copiar URL"}
        </button>
      </div>

      {loading ? (
        <p className="hint" style={{ margin: 0 }}>Carregando conexões ativas...</p>
      ) : connections.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>Nenhuma conexão ativa no momento.</p>
      ) : (
        <div className="budget-list">
          {connections.map((c) => (
            <div className="budget-card" key={c.id} style={{ padding: "12px 14px" }}>
              <div className="budget-row-top">
                <div>
                  <strong>{c.client_name || "ChatGPT"}</strong>
                  <div className="hint" style={{ marginTop: 2 }}>
                    Conectado em {new Date(c.created_at).toLocaleDateString("pt-BR")}
                    {c.last_used_at ? ` · Último uso em ${new Date(c.last_used_at).toLocaleDateString("pt-BR")}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-ghost-btn"
                  aria-label={`Revogar acesso de ${c.client_name || "ChatGPT"}`}
                  title="Revogar acesso"
                  disabled={revoking === c.id}
                  onClick={() => revoke(c.id)}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
