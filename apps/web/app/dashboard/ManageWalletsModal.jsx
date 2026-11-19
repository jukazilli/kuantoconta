"use client";
import { useState } from "react";
import { AlertTriangle, Archive, ArchiveRestore, Plus, X } from "lucide-react";
import BankIcon from "./BankIcon";
import { money } from "../../lib/finance";

export default function ManageWalletsModal({
  open,
  allWallets = [],
  walletBalance,
  busy,
  onClose,
  onNewWallet,
  onArchiveWallet,
  onUnarchiveWallet,
}) {
  const [archivingWallet, setArchivingWallet] = useState(null);
  const [targetWalletId, setTargetWalletId] = useState("");
  const [balanceAction, setBalanceAction] = useState("transfer");
  const [err, setErr] = useState("");

  if (!open) return null;

  const activeWallets = allWallets.filter((w) => !w.archived_at);
  const archivedWallets = allWallets.filter((w) => w.archived_at);
  const targetCandidates = archivingWallet
    ? activeWallets.filter((w) => w.id !== archivingWallet.id)
    : [];

  function startArchive(wallet) {
    setErr("");
    const others = activeWallets.filter((w) => w.id !== wallet.id);
    if (!others.length) {
      setErr("Cadastre outra conta ativa antes de arquivar esta, para receber seus compromissos.");
      return;
    }
    setArchivingWallet(wallet);
    setTargetWalletId(others[0].id);
    setBalanceAction("transfer");
  }

  async function confirmArchive(e) {
    e.preventDefault();
    if (!archivingWallet || !targetWalletId) return;
    setErr("");
    try {
      await onArchiveWallet({
        sourceWalletId: archivingWallet.id,
        targetWalletId,
        balanceAction,
      });
      setArchivingWallet(null);
    } catch (ex) {
      setErr(ex?.message || "Não foi possível arquivar a conta.");
    }
  }

  async function handleUnarchive(wallet) {
    setErr("");
    try {
      await onUnarchiveWallet(wallet.id);
    } catch (ex) {
      setErr(ex?.message || "Não foi possível desarquivar a conta.");
    }
  }

  return (
    <div
      className="action-overlay open"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          setArchivingWallet(null);
          onClose();
        }
      }}
    >
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="manageWalletsTitle">
        <div className="dialog-head">
          <div>
            <div className="eyebrow">CONTAS BANCÁRIAS E CARTEIRAS</div>
            <h2 id="manageWalletsTitle">
              {archivingWallet ? `Arquivar ${archivingWallet.name}` : "Gerenciar contas"}
            </h2>
          </div>
          <button
            type="button"
            className="dialog-close"
            onClick={() => {
              setArchivingWallet(null);
              onClose();
            }}
            aria-label="Fechar"
          >
            <X size={17} />
          </button>
        </div>

        {err && <div className="onboarding-error" role="alert" style={{ marginBottom: 12 }}>{err}</div>}

        {archivingWallet ? (
          <form onSubmit={confirmArchive} style={{ display: "grid", gap: 14 }}>
            <div
              className="alert"
              role="alert"
              style={{
                background: "#fff4ed",
                border: "1px solid #fed7aa",
                color: "#9a3412",
                borderRadius: 14,
                padding: "12px 14px",
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Atenção: esta ação não pode ser revertida.</strong>
                <div>
                  Todos os compromissos alocados em <strong>{archivingWallet.name}</strong> (a pagar, a receber, parcelas, recorrências e empréstimos) serão movidos para a conta destino. Se você desarquivar esta conta no futuro, ela voltará com <strong>saldo R$ 0,00</strong> e sem o histórico anterior.
                </div>
              </div>
            </div>

            <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 600 }}>
              Enviar compromissos para qual conta?
              <select
                required
                value={targetWalletId}
                onChange={(e) => setTargetWalletId(e.target.value)}
                style={{ border: "1px solid var(--kc-line)", borderRadius: 12, padding: "10px 12px", background: "#fff" }}
              >
                {targetCandidates.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({money(walletBalance(w))})
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                O que fazer com o saldo atual de {archivingWallet.name} ({money(walletBalance(archivingWallet))})?
              </span>
              <div className="direction-cards compact" role="group" aria-label="Destino do saldo atual">
                <button
                  type="button"
                  className={`direction-card income${balanceAction === "transfer" ? " active" : ""}`}
                  onClick={() => setBalanceAction("transfer")}
                >
                  <div>
                    <strong>Transferir saldo</strong>
                    <small>Soma na conta destino</small>
                  </div>
                </button>
                <button
                  type="button"
                  className={`direction-card expense${balanceAction === "discard" ? " active" : ""}`}
                  onClick={() => setBalanceAction("discard")}
                >
                  <div>
                    <strong>Descartar / zerar</strong>
                    <small>Não soma na conta destino</small>
                  </div>
                </button>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <button type="button" className="pill pill-secondary pill-compact" onClick={() => setArchivingWallet(null)} disabled={busy}>
                Voltar
              </button>
              <button type="submit" className="pill pill-primary pill-compact" disabled={busy}>
                <Archive size={15} /> {busy ? "Arquivando..." : "Confirmar arquivamento"}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: "grid", gap: 16, maxHeight: "65vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span className="eyebrow">CONTAS ATIVAS ({activeWallets.length})</span>
              <button
                type="button"
                className="pill pill-primary pill-compact"
                onClick={() => {
                  onClose();
                  onNewWallet();
                }}
              >
                <Plus size={15} /> Nova conta
              </button>
            </div>

            {activeWallets.length ? (
              <div className="budget-list">
                {activeWallets.map((w) => (
                  <div className="budget-card" key={w.id} style={{ padding: "12px 14px" }}>
                    <div className="budget-row-top">
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <BankIcon name={w.name} size={36} />
                        <div>
                          <strong>{w.name}</strong>
                          <div className="hint">{money(walletBalance(w))}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="pill pill-outline-orange pill-compact"
                        disabled={busy || activeWallets.length <= 1}
                        title={activeWallets.length <= 1 ? "Cadastre outra conta antes de arquivar" : `Arquivar ${w.name}`}
                        onClick={() => startArchive(w)}
                      >
                        <Archive size={14} /> Arquivar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint" style={{ margin: 0 }}>Nenhuma conta ativa.</p>
            )}

            {archivedWallets.length > 0 && (
              <div style={{ display: "grid", gap: 10 }}>
                <span className="eyebrow">CONTAS ARQUIVADAS ({archivedWallets.length})</span>
                <p className="hint" style={{ margin: 0 }}>
                  Ao desarquivar uma conta, ela volta com saldo R$ 0,00 e sem restaurar movimentações antigas.
                </p>
                <div className="budget-list">
                  {archivedWallets.map((w) => (
                    <div className="budget-card" key={w.id} style={{ padding: "12px 14px", opacity: 0.82 }}>
                      <div className="budget-row-top">
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <BankIcon name={w.name} size={34} />
                          <div>
                            <strong>{w.name}</strong>
                            <div className="hint">Arquivada · volta com R$ 0,00</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="pill pill-secondary pill-compact"
                          disabled={busy}
                          onClick={() => handleUnarchive(w)}
                        >
                          <ArchiveRestore size={14} /> Desarquivar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
