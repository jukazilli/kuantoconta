import {sql} from "../../../lib/db";
import {brDay,validSettlementDay} from "../../../lib/finance";
import {DEFAULT_CATEGORIES,allowedRoot} from "../../../lib/taxonomy";
import {getIdentity,legalAccepted,sameOrigin,PRIVATE_HEADERS} from "../../../lib/authorization";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const send=(o,s=200)=>Response.json(o,{status:s,headers:PRIVATE_HEADERS});
const error=(msg,s=400)=>send({error:msg},s);
const day=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(new Date(s+"T12:00:00Z").getTime())&&new Date(s+"T12:00:00Z").toISOString().slice(0,10)===s;
const textValue=(x,n)=>typeof x==="string"&&x.trim().length>0&&x.trim().length<=n?x.trim():null;
const uuid=x=>typeof x==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
function amount(x,allowZero=false,allowNegative=false){
 const s=String(x??"").trim().replace(",",".");
 const re=allowNegative?/^-?\d{1,10}(?:\.\d{1,2})?$/:/^\d{1,10}(?:\.\d{1,2})?$/;
 if(!re.test(s))throw new Error("Informe um valor válido em reais.");
 const negative=s.startsWith("-");
 const [a,b=""]=(negative?s.slice(1):s).split(".");
 const n=(negative?-1:1)*(Number(a)*100+Number(b.padEnd(2,"0")));
 if(!Number.isSafeInteger(n)||(!allowNegative&&n<0)||(!allowZero&&n===0))throw new Error("Valor inválido.");
 return n;
}
function monthOffset(d,delta){
 const [y,m,day]=d.split("-").map(Number);
 const dt=new Date(Date.UTC(y,m-1+delta,1));
 const end=new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth()+1,0)).getUTCDate();
 dt.setUTCDate(Math.min(end,day));
 return dt.toISOString().slice(0,10);
}
async function authenticate(){
 const user=await getIdentity();
 if(!user)return {error:"Sessão não autenticada.",status:401};
 if(!await legalAccepted(user.id))return {error:"Aceite dos termos pendente.",status:403};
 return {id:user.id};
}
async function jsonBody(r){const txt=await r.text();if(txt.length>12000)throw new Error("Solicitação muito grande.");return JSON.parse(txt);}
export async function GET(){
 const owner=await authenticate();if(!owner.id)return error(owner.error,owner.status);
 try{
  const [wallets,titles,settlements,assets,liabilities,savedCategories]=await Promise.all([
   sql`SELECT id,name,opening_balance_cents::text,opening_at,created_at FROM public.kc_wallets WHERE user_id=${owner.id} ORDER BY created_at LIMIT 100`,
   sql`SELECT id,wallet_id,description,direction,category,subcategory,amount_cents::text,settled_cents::text,due_on::text,recurrence,installment_index,installment_total,series_id,created_at FROM public.kc_titles WHERE user_id=${owner.id} AND cancelled_at IS NULL ORDER BY due_on,id LIMIT 4000`,
   sql`SELECT s.id,s.title_id,s.wallet_id,s.amount_cents::text,s.settled_on::text,s.created_at,t.direction,t.category FROM public.kc_settlements s JOIN public.kc_titles t ON t.id=s.title_id AND t.user_id=s.user_id WHERE s.user_id=${owner.id} ORDER BY s.settled_on,s.created_at LIMIT 7000`,
   sql`SELECT id,label,value_cents::text,valued_on::text FROM public.kc_assets WHERE user_id=${owner.id} ORDER BY label LIMIT 200`,
   sql`SELECT id,label,principal_cents::text,valued_on::text FROM public.kc_liabilities WHERE user_id=${owner.id} ORDER BY label LIMIT 200`,
   sql`SELECT id,name,direction,parent_id FROM public.kc_categories WHERE user_id=${owner.id} ORDER BY name LIMIT 300`
  ]);
  const mappedDefaults=Object.entries(DEFAULT_CATEGORIES).flatMap(([direction,names])=>names.filter(name=>!savedCategories.some(c=>c.direction===direction&&c.parent_id===null&&c.name.toLocaleLowerCase("pt-BR")===name.toLocaleLowerCase("pt-BR"))).map(name=>({id:"builtin:"+direction+":"+name,name,direction,parent_id:null,builtin:true})));
  return send({wallets,titles,settlements,assets,liabilities,categories:[...mappedDefaults,...savedCategories],as_of:new Date().toISOString()});
 }catch(e){console.error("portfolio-get",e?.name);return error("Falha ao consultar as finanças.",500);}
}
export async function POST(request){
 if(!sameOrigin(request))return error("Origem não permitida.",403);
 const owner=await authenticate();if(!owner.id)return error(owner.error,owner.status);
 try{
  const x=await jsonBody(request);
  if(x.action==="wallet"){
   const name=textValue(x.name,90);if(!name)return error("Informe o nome da conta.");
   const initial=amount(x.balance??"0",true,true);
   await sql`INSERT INTO public.kc_wallets(user_id,name,opening_balance_cents,opening_at) VALUES(${owner.id},${name},${initial},now())`;
   return send({saved:true},201);
  }
  if(x.action==="category"){
   const name=textValue(x.name,80),direction=x.direction;
   if(!name||!["income","expense"].includes(direction))return error("Nome ou tipo de categoria inválido.");
   if(!x.parentName){
     if(allowedRoot(direction,name))return error("Esta categoria já existe.",409);
     const present=await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${direction} AND parent_id IS NULL AND lower(name)=lower(${name}) LIMIT 1`;
     if(present.length)return error("Categoria já cadastrada.",409);
     await sql`INSERT INTO public.kc_categories(user_id,name,direction) VALUES(${owner.id},${name},${direction})`;
     return send({saved:true},201);
   }
   const parentName=textValue(x.parentName,80);
   if(!parentName)return error("Selecione uma categoria antes de adicionar subcategoria.");
   const parent=await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${direction} AND parent_id IS NULL AND name=${parentName} LIMIT 1`;
   if(!parent.length && !allowedRoot(direction,parentName))return error("Categoria não encontrada.",404);
   let parentId=parent[0]?.id;
   if(!parentId){
    await sql`INSERT INTO public.kc_categories(user_id,name,direction) VALUES(${owner.id},${parentName},${direction}) ON CONFLICT DO NOTHING`;
    const row=await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${direction} AND parent_id IS NULL AND name=${parentName} LIMIT 1`;
    parentId=row[0]?.id;
   }
   const present=await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${direction} AND lower(name)=lower(${name}) LIMIT 1`;
   if(present.length)return error("Essa subcategoria já está cadastrada.",409);
   await sql`INSERT INTO public.kc_categories(user_id,name,direction,parent_id) VALUES(${owner.id},${name},${direction},${parentId}::uuid)`;
   return send({saved:true},201);
  }
  if(x.action==="title"){
   const description=textValue(x.description,140),category=textValue(x.category||"Outros",70);
   if(!description||!category||!day(x.dueOn)||!["income","expense"].includes(x.direction)||!uuid(x.walletId))return error("Descrição, data, tipo, categoria ou conta inválidos.");
   const w=await sql`SELECT id FROM public.kc_wallets WHERE id=${x.walletId}::uuid AND user_id=${owner.id}`;
   if(!w.length)return error("Conta não encontrada.",404);
   const root=await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${x.direction} AND parent_id IS NULL AND name=${category} LIMIT 1`;
   if(!root.length && !allowedRoot(x.direction,category))return error("Selecione uma categoria cadastrada.");
   const subcategory=x.subcategory?textValue(x.subcategory,70):null;
   if(x.subcategory&&!subcategory)return error("Subcategoria inválida.");
   if(subcategory){
     const subs=await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${x.direction} AND name=${subcategory} AND parent_id IN (SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND name=${category} AND direction=${x.direction} AND parent_id IS NULL) LIMIT 1`;
     if(!subs.length)return error("Selecione uma subcategoria já cadastrada.");
   }
   const base=amount(x.amount);
   const mode=["single","installments","monthly"].includes(x.mode)?x.mode:"single";
   const count=mode==="single"?1:mode==="monthly"?24:Number(x.count);
   if(!Number.isInteger(count)||count<1||count>60)return error("Quantidade de parcelas inválida.");
   const start=mode==="installments"?Number(x.startIndex||1):1;
   if(!Number.isInteger(start)||start<1||start>count)return error("Parcela inicial inválida.");
   const perMode=x.valueMode==="installment"?"installment":"total";
   if(mode==="installments"&&perMode==="total"&&base<count)return error("Total insuficiente para esse número de parcelas.");
   const seriesId=mode==="single"?null:crypto.randomUUID();
   const floor=Math.floor(base/count),remainder=base%count;
   const rows=[];
   for(let i=start;i<=count;i++){
    const amountCents=mode==="installments"?(perMode==="total"?floor+(i<=remainder?1:0):base):base;
    const due=monthOffset(x.dueOn,i-start);
    rows.push({description:mode==="installments"?description+" ("+i+"/"+count+")":description,direction:x.direction,category,subcategory,amount_cents:amountCents,due_on:due,recurrence:mode,series_id:seriesId,installment_index:i,installment_total:count,wallet_id:x.walletId});
   }
   // Atomic insert for a whole series; no partially created installment contracts.
   await sql`INSERT INTO public.kc_titles(user_id,wallet_id,description,direction,category,subcategory,amount_cents,due_on,recurrence,series_id,installment_index,installment_total)
   SELECT ${owner.id},r.wallet_id,r.description,r.direction,r.category,r.subcategory,r.amount_cents,r.due_on,r.recurrence,r.series_id,r.installment_index,r.installment_total
   FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS r(wallet_id uuid,description text,direction text,category text,subcategory text,amount_cents bigint,due_on date,recurrence text,series_id uuid,installment_index int,installment_total int)`;
   return send({saved:true,count:rows.length},201);
  }
  if(x.action==="asset"||x.action==="liability"){
   const label=textValue(x.label,120),value=amount(x.amount,true);
   if(!label)return error("Descrição inválida.");
   if(x.action==="asset")await sql`INSERT INTO public.kc_assets(user_id,label,value_cents,valued_on) VALUES(${owner.id},${label},${value},current_date)`;
   else await sql`INSERT INTO public.kc_liabilities(user_id,label,principal_cents,valued_on) VALUES(${owner.id},${label},${value},current_date)`;
   return send({saved:true},201);
  }
  return error("Ação não reconhecida.");
 }catch(e){if(e?.message?.includes("Informe")||e?.message?.includes("Valor")||e?.message?.includes("Solicitação"))return error(e.message);if(e?.code==="23505")return error("Nome já utilizado. Escolha outro para evitar duplicidade.",409);console.error("portfolio-post",e?.name);return error("Não foi possível salvar.",500);}
}
export async function PATCH(request){
 if(!sameOrigin(request))return error("Origem não permitida.",403);
 const owner=await authenticate();if(!owner.id)return error(owner.error,owner.status);
 try{
  const x=await jsonBody(request);
  if(x.action==="settle"){
   if(!uuid(x.titleId)||!uuid(x.idempotency)||!day(x.settledOn))return error("Dados de baixa inválidos.");
   if(!validSettlementDay(x.settledOn,brDay()))return error("A baixa realizada não pode ter uma data futura.");
   const value=amount(x.amount);
   const rows=await sql`SELECT public.kc_settle_title(${owner.id},${x.titleId}::uuid,${value},${x.settledOn}::date,${x.idempotency}::uuid) AS id`;
   return send({saved:true,id:rows[0]?.id});
  }
  if(x.action==="edit"){
   if(!uuid(x.titleId)||!uuid(x.walletId)||!day(x.dueOn)||!["income","expense"].includes(x.direction))return error("Título ou dados inválidos.");
   const description=textValue(x.description,140),category=textValue(x.category,70),subcategory=x.subcategory?textValue(x.subcategory,70):null;
   if(!description||!category||(x.subcategory&&!subcategory))return error("Descrição ou categoria inválida.");
   const title=await sql`SELECT id,settled_cents,wallet_id FROM public.kc_titles WHERE user_id=${owner.id} AND id=${x.titleId}::uuid AND direction=${x.direction} AND cancelled_at IS NULL LIMIT 1`;
   if(!title.length)return error("Título não encontrado.",404);
   if(Number(title[0].settled_cents)>0 && String(title[0].wallet_id)!==x.walletId)return error("A conta de um título com baixa não pode ser alterada.",409);
   const account=await sql`SELECT id FROM public.kc_wallets WHERE user_id=${owner.id} AND id=${x.walletId}::uuid LIMIT 1`;
   if(!account.length)return error("Conta não encontrada.",404);
   const root=await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${x.direction} AND name=${category} AND parent_id IS NULL LIMIT 1`;
   if(!root.length && !allowedRoot(x.direction,category))return error("Categoria inválida.");
   if(subcategory){
    const sub=await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${x.direction} AND name=${subcategory} AND parent_id IN (SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${x.direction} AND name=${category} AND parent_id IS NULL) LIMIT 1`;
    if(!sub.length)return error("Subcategoria inválida.");
   }
   const value=amount(x.amount);
   const edited=await sql`UPDATE public.kc_titles SET wallet_id=${x.walletId}::uuid,description=${description},category=${category},subcategory=${subcategory},amount_cents=${value},due_on=${x.dueOn}::date
    WHERE user_id=${owner.id} AND id=${x.titleId}::uuid AND direction=${x.direction} AND cancelled_at IS NULL AND settled_cents<=${value}
    AND (settled_cents=0 OR wallet_id=${x.walletId}::uuid) RETURNING id`;
   return edited.length?send({saved:true,scope:"this-occurrence"}):error("O valor não pode ficar abaixo do que já foi baixado.",409);
  }
  if(x.action==="cancel"){
   if(!uuid(x.titleId))return error("Identificador inválido.");
   const rows=await sql`UPDATE public.kc_titles SET cancelled_at=now() WHERE id=${x.titleId}::uuid AND user_id=${owner.id} AND settled_cents=0 AND cancelled_at IS NULL RETURNING id`;
   return rows.length?send({saved:true}):error("Não é possível excluir um título já baixado ou inexistente.",409);
  }
  return error("Ação não reconhecida.");
 }catch(e){if(e?.message?.includes("Informe")||e?.message?.includes("Valor")||e?.message?.includes("exceeds"))return error("Valor maior que o saldo pendente.",409);console.error("portfolio-patch",e?.name);return error("Falha na operação.",500);}
}
