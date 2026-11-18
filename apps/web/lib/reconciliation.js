import { cents } from "./finance.js";

function walletBalanceCents(wallet, settlements) {
  if (wallet.opening_balance_cents === null || wallet.opening_balance_cents === undefined || !wallet.opening_at) {
    return null;
  }
  const openAt = new Date(wallet.opening_at).getTime();
  const posted = settlements.reduce((sum, s) => {
    if (s.reversed_at || String(s.wallet_id) !== String(wallet.id)) return sum;
    if (new Date(s.created_at).getTime() <= openAt) return sum;
    return sum + (s.direction === "income" ? 1 : -1) * cents(s.amount_cents);
  }, 0);
  return cents(wallet.opening_balance_cents) + posted;
}

/**
 * Reconciles wallets, assets, liabilities, debt payments, and reserve transfers
 * without double-counting linked investments, debt installments, or internal transfers.
 */
export function reconcilePortfolio(data) {
  const wallets = data?.wallets || [];
  const settlements = (data?.settlements || []).filter((s) => !s.reversed_at);
  const assets = data?.assets || [];
  const liabilities = data?.liabilities || [];
  const debtPayments = data?.debtPayments || [];
  const titles = data?.titles || [];

  const walletIdSet = new Set(wallets.map((w) => String(w.id)));
  const unknownCash =
    wallets.length === 0 ||
    wallets.some(
      (w) =>
        w.opening_balance_cents === null ||
        w.opening_balance_cents === undefined ||
        !w.opening_at
    );

  let operatingCashCents = 0;
  let walletReserveCents = 0;
  let walletInvestmentCents = 0;
  let immediateLiquidityCents = 0;

  const walletBreakdown = wallets.map((w) => {
    const bal = walletBalanceCents(w, settlements);
    const kind = w.wallet_kind || "checking";
    const liquidity = w.liquidity_kind || "immediate";
    const isReserved = Boolean(w.is_reserved) || kind === "reserve";

    if (bal !== null) {
      if (isReserved) {
        walletReserveCents += bal;
      } else if (kind === "investment") {
        walletInvestmentCents += bal;
      } else {
        operatingCashCents += bal;
      }

      if (liquidity === "immediate") {
        immediateLiquidityCents += bal;
      }
    }

    return {
      id: w.id,
      name: w.name,
      walletKind: kind,
      liquidityKind: liquidity,
      isReserved,
      balanceCents: bal,
    };
  });

  // Deduplicate assets that are already tracked in kc_wallets via linked_wallet_id (FH-08)
  let unlinkedAssetsCents = 0;
  let assetReserveCents = 0;
  let assetInvestmentCents = 0;
  let duplicatedLinkedAssetsCount = 0;

  for (const a of assets) {
    if (a.linked_wallet_id && walletIdSet.has(String(a.linked_wallet_id))) {
      duplicatedLinkedAssetsCount++;
      continue;
    }
    const val = cents(a.value_cents);
    unlinkedAssetsCents += val;
    if (a.asset_kind === "reserve") {
      assetReserveCents += val;
      if (a.liquidity_kind === "immediate") immediateLiquidityCents += val;
    } else if (a.asset_kind === "investment") {
      assetInvestmentCents += val;
      if (a.liquidity_kind === "immediate") immediateLiquidityCents += val;
    }
  }

  // Liabilities: sum contractual principal_cents of active liabilities only (never re-add installments)
  const activeLiabilities = liabilities.filter((l) => l.status !== "settled");
  const outstandingDebtCents = activeLiabilities.reduce(
    (sum, l) => sum + Math.max(0, cents(l.principal_cents)),
    0
  );
  const debtSeriesIds = new Set(
    liabilities.filter((l) => l.series_id).map((l) => String(l.series_id))
  );
  const debtLiabilityIds = new Set(liabilities.map((l) => String(l.id)));

  // Split debt payments into principal amortized vs financial interest cost (FH-06)
  let totalPrincipalPaidCents = 0;
  let totalInterestCostCents = 0;
  for (const p of debtPayments) {
    totalPrincipalPaidCents += Math.max(0, cents(p.principal_cents));
    totalInterestCostCents += Math.max(0, cents(p.interest_fee_cents));
  }

  // Filter consumption vs internal reserve transfers (FH-07)
  const consumptionTitles = titles.filter(
    (t) => (t.entry_kind || "standard") !== "reserve_transfer"
  );
  const reserveTransferTitles = titles.filter(
    (t) => t.entry_kind === "reserve_transfer"
  );

  // Open payable excluding installments already represented in contractual debt principal
  const nonDebtOpenPayableCents = titles
    .filter((t) => {
      if (t.direction !== "expense" || t.recurrence === "monthly") return false;
      if (t.liability_id && debtLiabilityIds.has(String(t.liability_id))) return false;
      if (t.series_id && debtSeriesIds.has(String(t.series_id))) return false;
      return true;
    })
    .reduce((sum, t) => sum + Math.max(0, cents(t.amount_cents) - cents(t.settled_cents)), 0);

  const totalWalletCashCents = unknownCash
    ? null
    : operatingCashCents + walletReserveCents + walletInvestmentCents;

  const liquidReserveCents = unknownCash
    ? null
    : Math.max(0, walletReserveCents + assetReserveCents);

  const netWorthCents =
    totalWalletCashCents === null
      ? null
      : totalWalletCashCents + unlinkedAssetsCents - outstandingDebtCents;

  return {
    knownCash: !unknownCash,
    totalWalletCashCents,
    operatingCashCents: unknownCash ? null : operatingCashCents,
    walletReserveCents: unknownCash ? null : walletReserveCents,
    walletInvestmentCents: unknownCash ? null : walletInvestmentCents,
    immediateLiquidityCents: unknownCash ? null : immediateLiquidityCents,
    unlinkedAssetsCents,
    assetReserveCents,
    assetInvestmentCents,
    duplicatedLinkedAssetsCount,
    liquidReserveCents,
    outstandingDebtCents,
    totalPrincipalPaidCents,
    totalInterestCostCents,
    nonDebtOpenPayableCents,
    netWorthCents,
    walletBreakdown,
    consumptionTitles,
    reserveTransferTitles,
    activeLiabilities,
  };
}
