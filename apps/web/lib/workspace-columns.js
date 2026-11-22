export const VALID_WORKSPACE_COLUMNS = [
  "overview",
  "movements",
  "budgets",
  "planning",
  "patrimony",
  "health",
];

export const DEFAULT_DESKTOP_COLUMNS = ["overview", "movements", "health"];

export const WORKSPACE_COLUMN_META = {
  overview: {
    key: "overview",
    label: "Visão geral",
    description: "Indicadores principais, gráficos e próximos compromissos",
  },
  movements: {
    key: "movements",
    label: "Movimentos",
    description: "Lançamentos recentes, filtros rápidos e busca",
  },
  budgets: {
    key: "budgets",
    label: "Orçamentos",
    description: "Limites mensais, consumo por categoria e alertas",
  },
  planning: {
    key: "planning",
    label: "Planejamento",
    description: "Caixinhas, compras, viagens e listas comparadas",
  },
  patrimony: {
    key: "patrimony",
    label: "Meu Capital",
    description: "Contas, cartões de crédito, pessoas e patrimônio",
  },
  health: {
    key: "health",
    label: "Saúde financeira",
    description: "Diagnóstico, marcos de recuperação e hábitos",
  },
};

const VALID_SET = new Set(VALID_WORKSPACE_COLUMNS);

/**
 * Sanitizes an array of column keys, preserving order and uniqueness.
 * Falls back to DEFAULT_DESKTOP_COLUMNS only when input is not an array.
 */
export function sanitizeWorkspaceColumns(columns) {
  if (!Array.isArray(columns)) return [...DEFAULT_DESKTOP_COLUMNS];
  const seen = new Set();
  const clean = [];
  for (const raw of columns) {
    const k = String(raw || "");
    if (!VALID_SET.has(k) || seen.has(k)) continue;
    seen.add(k);
    clean.push(k);
  }
  return clean;
}

export function addWorkspaceColumn(columns, key) {
  const clean = sanitizeWorkspaceColumns(columns);
  if (!VALID_SET.has(key) || clean.includes(key)) return clean;
  return [...clean, key];
}

export function removeWorkspaceColumn(columns, key) {
  const clean = sanitizeWorkspaceColumns(columns);
  return clean.filter((k) => k !== key);
}

export function moveWorkspaceColumn(columns, key, delta) {
  const clean = sanitizeWorkspaceColumns(columns);
  const idx = clean.indexOf(key);
  if (idx < 0) return clean;
  const target = idx + (delta < 0 ? -1 : 1);
  if (target < 0 || target >= clean.length) return clean;
  const next = [...clean];
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}

export function reorderWorkspaceColumns(columns, fromKey, toKey) {
  const clean = sanitizeWorkspaceColumns(columns);
  if (!fromKey || !toKey || fromKey === toKey) return clean;
  const fromIdx = clean.indexOf(fromKey);
  const toIdx = clean.indexOf(toKey);
  if (fromIdx < 0 || toIdx < 0) return clean;
  const next = [...clean];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return next;
}

export function sanitizeColumnSettings(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const key of VALID_WORKSPACE_COLUMNS) {
    const val = raw[key];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      out[key] = {
        showCharts: val.showCharts !== false,
        compact: Boolean(val.compact),
      };
    }
  }
  return out;
}
