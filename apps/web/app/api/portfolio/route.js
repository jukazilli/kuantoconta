import { getIdentity, legalAccepted, sameOrigin, PRIVATE_HEADERS } from "../../../lib/authorization";
import { loadPortfolio, executePortfolioPost, executePortfolioPatch } from "../../../lib/portfolio-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const send = (o, s = 200) => Response.json(o, { status: s, headers: PRIVATE_HEADERS });
const error = (msg, s = 400) => send({ error: msg }, s);

async function authenticate() {
  const user = await getIdentity();
  if (!user) return { error: "Sessão não autenticada.", status: 401 };
  if (!(await legalAccepted(user.id))) return { error: "Aceite dos termos pendente.", status: 403 };
  return { id: user.id };
}

async function jsonBody(r) {
  const txt = await r.text();
  if (txt.length > 12000) throw new Error("Solicitação muito grande.");
  return JSON.parse(txt);
}

export async function GET() {
  const owner = await authenticate();
  if (!owner.id) return error(owner.error, owner.status);
  try {
    const data = await loadPortfolio(owner.id);
    return send(data);
  } catch (e) {
    console.error("portfolio-get", e?.name);
    return error("Falha ao consultar as finanças.", 500);
  }
}

export async function POST(request) {
  if (!sameOrigin(request)) return error("Origem não permitida.", 403);
  const owner = await authenticate();
  if (!owner.id) return error(owner.error, owner.status);
  try {
    const x = await jsonBody(request);
    const res = await executePortfolioPost(owner.id, x);
    return res.ok ? send(res.data, res.status) : error(res.error, res.status);
  } catch (e) {
    if (e?.message?.includes("Informe") || e?.message?.includes("Valor") || e?.message?.includes("Solicitação")) {
      return error(e.message);
    }
    if (e?.code === "23505") return error("Nome já utilizado. Escolha outro para evitar duplicidade.", 409);
    console.error("portfolio-post", e?.name);
    return error("Não foi possível salvar.", 500);
  }
}

export async function PATCH(request) {
  if (!sameOrigin(request)) return error("Origem não permitida.", 403);
  const owner = await authenticate();
  if (!owner.id) return error(owner.error, owner.status);
  try {
    const x = await jsonBody(request);
    const res = await executePortfolioPatch(owner.id, x);
    return res.ok ? send(res.data, res.status) : error(res.error, res.status);
  } catch (e) {
    if (e?.message?.includes("Informe") || e?.message?.includes("Valor") || e?.message?.includes("exceeds")) {
      return error("Valor maior que o saldo pendente.", 409);
    }
    if (e?.code === "22023" || e?.code === "P0002") {
      return error(e?.message?.slice(0, 180) || "Operação indisponível.", 409);
    }
    console.error("portfolio-patch", e?.name);
    return error("Falha na operação.", 500);
  }
}
