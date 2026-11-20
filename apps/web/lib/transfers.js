import { cents } from "./finance.js";

/**
 * Validates wallet-to-wallet transfer parameters.
 */
export function validateTransfer({ fromWalletId, toWalletId, amountCents, transferredOn }) {
  if (!fromWalletId || !toWalletId) {
    return { ok: false, error: "Selecione as contas de origem e destino." };
  }
  if (String(fromWalletId) === String(toWalletId)) {
    return { ok: false, error: "A conta de origem e a conta de destino devem ser diferentes." };
  }
  const amt = cents(amountCents);
  if (!Number.isSafeInteger(amt) || amt <= 0) {
    return { ok: false, error: "Informe um valor válido maior que zero." };
  }
  if (!transferredOn || !/^\d{4}-\d{2}-\d{2}$/.test(transferredOn)) {
    return { ok: false, error: "Informe uma data de transferência válida." };
  }
  return { ok: true, amountCents: amt };
}

/**
 * Formats descriptive labels for debit (out) and credit (in) legs of a transfer.
 */
export function formatTransferDescriptions({ fromWalletName = "Conta de origem", toWalletName = "Conta de destino", customDescription = "" }) {
  const custom = String(customDescription || "").trim();
  if (custom) {
    return {
      outDescription: custom.slice(0, 140),
      inDescription: custom.slice(0, 140)
    };
  }
  return {
    outDescription: `Transferência para ${toWalletName}`.slice(0, 140),
    inDescription: `Transferência de ${fromWalletName}`.slice(0, 140)
  };
}

/**
 * Finds the counterpart title linked by transfer_id.
 */
export function findCounterpartTransferTitle(title, allTitles = []) {
  if (!title?.transfer_id) return null;
  return allTitles.find(t => t.transfer_id === title.transfer_id && t.id !== title.id) || null;
}

/**
 * Identifies if a title or settlement is an internal transfer between accounts.
 */
export function isTransferTitle(title) {
  if (!title) return false;
  const kind = title.entry_kind || "standard";
  return kind === "transfer" || Boolean(title.transfer_id);
}
