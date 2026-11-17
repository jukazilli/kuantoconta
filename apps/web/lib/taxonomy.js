// Shared stable catalog; additional items are per-user records in Neon Postgres.
export const DEFAULT_CATEGORIES={
 expense:["Moradia","Alimentação","Transporte","Saúde","Lazer","Educação","Assinaturas","Empréstimos","Outros"],
 income:["Salário","Renda extra","Benefícios","Rendimentos","Reembolsos","Outros"]
};
export function allowedRoot(direction,name){
 return (DEFAULT_CATEGORIES[direction]||[]).some(n=>n.toLocaleLowerCase("pt-BR")===String(name).toLocaleLowerCase("pt-BR"));
}
