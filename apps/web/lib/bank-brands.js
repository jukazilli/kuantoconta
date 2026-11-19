function normBank(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const BANK_BRANDS = [
  // Digitais & Fintechs
  { id: "nubank", name: "Nubank", kind: "digital", bg: "#820AD1", fg: "#FFFFFF", mark: "nu", aliases: ["nubank", "nu pagamentos", "nuconta", "nu"] },
  { id: "maree", name: "Maré (Shopee)", kind: "digital", bg: "#EE4D2D", fg: "#FFFFFF", mark: "M", aliases: ["maree", "mare", "shopee", "shopeepay", "banco mare", "banco maree"] },
  { id: "inter", name: "Inter", kind: "digital", bg: "#FF7A00", fg: "#FFFFFF", mark: "inter", aliases: ["inter", "banco inter"] },
  { id: "c6", name: "C6 Bank", kind: "digital", bg: "#18181B", fg: "#FFFFFF", mark: "C6", aliases: ["c6", "c6 bank", "c6bank"] },
  { id: "picpay", name: "PicPay", kind: "digital", bg: "#11C76F", fg: "#FFFFFF", mark: "P", aliases: ["picpay", "pic pay"] },
  { id: "neon", name: "Neon", kind: "digital", bg: "#00A5F0", fg: "#FFFFFF", mark: "N", aliases: ["neon", "banco neon"] },
  { id: "mercado_pago", name: "Mercado Pago", kind: "digital", bg: "#009EE3", fg: "#FFFFFF", mark: "MP", aliases: ["mercado pago", "mercadopago"] },
  { id: "pagbank", name: "PagBank", kind: "digital", bg: "#00A859", fg: "#FFFFFF", mark: "PB", aliases: ["pagbank", "pagseguro", "pag bank"] },
  { id: "next", name: "Next", kind: "digital", bg: "#00E676", fg: "#0A2E1A", mark: "next", aliases: ["next", "banco next"] },
  { id: "will", name: "Will Bank", kind: "digital", bg: "#FFD100", fg: "#16171C", mark: "will", aliases: ["will", "will bank", "willbank"] },
  { id: "pan", name: "Banco Pan", kind: "digital", bg: "#0066FF", fg: "#FFFFFF", mark: "PAN", aliases: ["pan", "banco pan"] },
  { id: "stone", name: "Stone", kind: "digital", bg: "#00A868", fg: "#FFFFFF", mark: "S", aliases: ["stone", "conta stone"] },
  { id: "cora", name: "Cora", kind: "digital", bg: "#FE3E6D", fg: "#FFFFFF", mark: "C", aliases: ["cora", "banco cora"] },
  { id: "xp", name: "XP Investimentos", kind: "digital", bg: "#141414", fg: "#FFD100", mark: "XP", aliases: ["xp", "xp investimentos", "banco xp"] },
  { id: "btg", name: "BTG Pactual", kind: "digital", bg: "#001E62", fg: "#FFFFFF", mark: "BTG", aliases: ["btg", "btg pactual"] },
  { id: "nomad", name: "Nomad", kind: "digital", bg: "#1C1C1E", fg: "#F59E0B", mark: "N", aliases: ["nomad"] },
  { id: "wise", name: "Wise", kind: "digital", bg: "#9FE870", fg: "#163300", mark: "W", aliases: ["wise", "transferwise"] },
  { id: "revolut", name: "Revolut", kind: "digital", bg: "#191C1F", fg: "#FFFFFF", mark: "R", aliases: ["revolut"] },
  { id: "99pay", name: "99Pay", kind: "digital", bg: "#FFCC00", fg: "#16171C", mark: "99", aliases: ["99pay", "99 pay"] },
  { id: "recargapay", name: "RecargaPay", kind: "digital", bg: "#0066CC", fg: "#FFFFFF", mark: "RP", aliases: ["recargapay", "recarga pay"] },
  { id: "iti", name: "iti Itaú", kind: "digital", bg: "#EC008C", fg: "#FFFFFF", mark: "iti", aliases: ["iti", "iti itau"] },
  { id: "sofisa", name: "Sofisa Direto", kind: "digital", bg: "#008B5E", fg: "#FFFFFF", mark: "SD", aliases: ["sofisa", "sofisa direto"] },
  { id: "bs2", name: "Banco BS2", kind: "digital", bg: "#003399", fg: "#FFFFFF", mark: "BS2", aliases: ["bs2", "banco bs2"] },
  { id: "digio", name: "Digio", kind: "digital", bg: "#002D72", fg: "#FFFFFF", mark: "dg", aliases: ["digio", "banco digio"] },
  { id: "original", name: "Banco Original", kind: "digital", bg: "#00A859", fg: "#FFFFFF", mark: "O", aliases: ["original", "banco original"] },
  { id: "asaas", name: "Asaas", kind: "digital", bg: "#0030B9", fg: "#FFFFFF", mark: "A", aliases: ["asaas"] },

  // Bancos Físicos / Tradicionais
  { id: "itau", name: "Itaú", kind: "traditional", bg: "#EC7000", fg: "#FFFFFF", accent: "#003399", mark: "itaú", aliases: ["itau", "itau unibanco", "banco itau"] },
  { id: "bradesco", name: "Bradesco", kind: "traditional", bg: "#CC092F", fg: "#FFFFFF", mark: "B", aliases: ["bradesco", "banco bradesco"] },
  { id: "bb", name: "Banco do Brasil", kind: "traditional", bg: "#FFEF00", fg: "#003882", mark: "BB", aliases: ["banco do brasil", "bb"] },
  { id: "caixa", name: "Caixa Econômica", kind: "traditional", bg: "#005CA9", fg: "#FFFFFF", accent: "#F37021", mark: "X", aliases: ["caixa", "caixa economica", "caixa economica federal", "cef"] },
  { id: "santander", name: "Santander", kind: "traditional", bg: "#EC0000", fg: "#FFFFFF", mark: "S", aliases: ["santander", "banco santander"] },
  { id: "banrisul", name: "Banrisul", kind: "traditional", bg: "#00569D", fg: "#FFFFFF", mark: "BR", aliases: ["banrisul"] },
  { id: "safra", name: "Banco Safra", kind: "traditional", bg: "#00205B", fg: "#C5A059", mark: "S", aliases: ["safra", "banco safra"] },
  { id: "bv", name: "Banco BV", kind: "traditional", bg: "#0047BB", fg: "#FFFFFF", mark: "bv", aliases: ["bv", "banco bv", "votorantim"] },
  { id: "brb", name: "BRB", kind: "traditional", bg: "#00529B", fg: "#FFFFFF", mark: "BRB", aliases: ["brb", "banco de brasilia"] },
  { id: "banestes", name: "Banestes", kind: "traditional", bg: "#005CA9", fg: "#FFFFFF", mark: "BE", aliases: ["banestes"] },
  { id: "bnb", name: "Banco do Nordeste", kind: "traditional", bg: "#A6192E", fg: "#FFFFFF", mark: "BNB", aliases: ["bnb", "banco do nordeste"] },

  // Cooperativas de Crédito
  { id: "sicredi", name: "Sicredi", kind: "coop", bg: "#3E9B2E", fg: "#FFFFFF", mark: "SC", aliases: ["sicredi"] },
  { id: "sicoob", name: "Sicoob", kind: "coop", bg: "#003641", fg: "#00AE9D", mark: "SB", aliases: ["sicoob"] },
  { id: "unicred", name: "Unicred", kind: "coop", bg: "#005B45", fg: "#FFFFFF", mark: "U", aliases: ["unicred"] },
  { id: "cresol", name: "Cresol", kind: "coop", bg: "#F37021", fg: "#FFFFFF", accent: "#00529B", mark: "CR", aliases: ["cresol"] },
  { id: "ailos", name: "Ailos / Viacredi", kind: "coop", bg: "#003B5C", fg: "#00A3E0", mark: "AL", aliases: ["ailos", "viacredi", "cecred"] },
  { id: "sisprime", name: "Sisprime", kind: "coop", bg: "#004F39", fg: "#FFFFFF", mark: "SP", aliases: ["sisprime"] },
];

export function findBankBrand(accountName) {
  const q = normBank(accountName);
  if (!q) return null;
  // Exact alias match first, then substring match with longest alias priority
  for (const b of BANK_BRANDS) {
    if (b.aliases.includes(q)) return b;
  }
  const padded = ` ${q} `;
  let best = null;
  let bestLen = 0;
  for (const b of BANK_BRANDS) {
    for (const alias of b.aliases) {
      if (alias.length >= 2 && (padded.includes(` ${alias} `) || q.startsWith(alias) || q.includes(alias))) {
        if (alias.length > bestLen) {
          best = b;
          bestLen = alias.length;
        }
      }
    }
  }
  return best;
}

export function bankIconPath(brand) {
  return brand ? `/banks/${brand.id}.svg` : null;
}
