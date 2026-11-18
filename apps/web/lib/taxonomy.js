// Shared stable catalog; additional items are per-user records in Neon Postgres.
export const DEFAULT_CATEGORIES = {
  expense: ["Moradia", "Alimentação", "Transporte", "Saúde", "Lazer", "Educação", "Assinaturas", "Empréstimos", "Outros"],
  income: ["Salário", "Renda extra", "Benefícios", "Rendimentos", "Reembolsos", "Outros"]
};

export function normalizeCategoryName(name) {
  return String(name || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");
}

export function canonicalCategoryKey(direction, name) {
  const slug = normalizeCategoryName(name)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug ? `${direction}.${slug}` : null;
}

export function allowedRoot(direction, name) {
  const target = normalizeCategoryName(name);
  return (DEFAULT_CATEGORIES[direction] || []).some(n => normalizeCategoryName(n) === target);
}
