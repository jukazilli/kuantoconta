import {sql} from "../../../lib/db";
import {brDay,validSettlementDay} from "../../../lib/finance";
import {DEFAULT_CATEGORIES,allowedRoot,canonicalCategoryKey,normalizeCategoryName} from "../../../lib/taxonomy";
import {isValidMonth} from "../../../lib/budgets";
import {decodeOccurrenceId,occurrenceForMonth} from "../../../lib/recurring";
import {validScope} from "../../../lib/cancel-scope";
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
async function seedDefaultCategories(userId){
 const defaults=Object.entries(DEFAULT_CATEGORIES).flatMap(([direction,names])=>
  names.map(name=>({name,direction,canonical_key:canonicalCategoryKey(direction,name)}))
 );
 await sql`INSERT INTO public.kc_categories(user_id,name,direction,canonical_key)
  SELECT ${userId},r.name,r.direction,r.canonical_key
  FROM jsonb_to_recordset(${JSON.stringify(defaults)}::jsonb) AS r(name text,direction text,canonical_key text)
  ON CONFLICT DO NOTHING`;
}
export async function GET(){
 const owner=await authenticate();if(!owner.id)return error(owner.error,owner.status);
 try{
  await seedDefaultCategories(owner.id);
  const [wallets,titles,settlements,assets,liabilities,savedCategories,recurringRules,cancelledRecurring,cancellations,budgetRules,budgetPeriods,economicEvents]=await Promise.all([
   sql`SELECT id,name,opening_balance_cents::text,opening_at,created_at FROM public.kc_wallets WHERE user_id=${owner.id} ORDER BY created_at LIMIT 100`,
   sql`SELECT id,wallet_id,description,direction,category,subcategory,category_id,subcategory_id,economic_event_id,amount_cents::text,settled_cents::text,due_on::text,recurrence,installment_index,installment_total,series_id,created_at FROM public.kc_titles WHERE user_id=${owner.id} AND cancelled_at IS NULL ORDER BY due_on,id LIMIT 4000`,
   sql`SELECT s.id,s.title_id,s.wallet_id,s.amount_cents::text,s.settled_on::text,s.created_at,s.reversed_at,s.reversal_reason,t.direction,t.category FROM public.kc_settlements s JOIN public.kc_titles t ON t.id=s.title_id AND t.user_id=s.user_id WHERE s.user_id=${owner.id} ORDER BY s.settled_on,s.created_at LIMIT 7000`,
   sql`SELECT id,label,value_cents::text,valued_on::text FROM public.kc_assets WHERE user_id=${owner.id} ORDER BY label LIMIT 200`,
   sql`SELECT id,label,principal_cents::text,valued_on::text FROM public.kc_liabilities WHERE user_id=${owner.id} ORDER BY label LIMIT 200`,
   sql`SELECT id,name,direction,parent_id,canonical_key,active FROM public.kc_categories WHERE user_id=${owner.id} ORDER BY name LIMIT 300`,
   sql`SELECT id,wallet_id,direction,description,category,subcategory,category_id,subcategory_id,amount_cents::text,starts_on::text,ends_on::text,paused_at::text,created_at FROM public.kc_recurring_rules WHERE user_id=${owner.id} ORDER BY starts_on LIMIT 300`,
   sql`SELECT series_id,installment_index FROM public.kc_titles WHERE user_id=${owner.id} AND cancelled_at IS NOT NULL AND series_id IS NOT NULL LIMIT 4000`,
   sql`SELECT title_id,SUM(cancelled_pending_cents)::text AS cancelled_pending_cents,MAX(original_amount_cents)::text AS original_amount_cents FROM public.kc_title_cancellation_events WHERE user_id=${owner.id} GROUP BY title_id LIMIT 4000`,
   sql`SELECT id,category_id,limit_cents::text,starts_month,ends_month,active,created_at FROM public.kc_budget_rules WHERE user_id=${owner.id} ORDER BY created_at LIMIT 300`,
   sql`SELECT id,category_id,month,limit_cents::text,source_rule_id,version,updated_at FROM public.kc_budget_periods WHERE user_id=${owner.id} ORDER BY month DESC LIMIT 1200`,
   sql`SELECT id,direction,description,amount_cents::text,occurred_on::text,category_id,subcategory_id,event_kind,competence_source,status,recurring_rule_id,parent_event_id,created_at FROM public.kc_economic_events WHERE user_id=${owner.id} AND cancelled_at IS NULL ORDER BY occurred_on DESC,created_at DESC LIMIT 4000`
  ]);
  return send({wallets,titles,settlements,assets,liabilities,recurringRules,cancelledRecurring,cancellations,categories:savedCategories,budgetRules,budgetPeriods,economicEvents,as_of:new Date().toISOString()});
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
   const normalized=normalizeCategoryName(name);
   const existingCats=await sql`SELECT id,name,parent_id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${direction} LIMIT 300`;
   if(!x.parentName){
     if(allowedRoot(direction,name)||existingCats.some(c=>!c.parent_id&&normalizeCategoryName(c.name)===normalized))return error("Categoria já cadastrada.",409);
     const key=canonicalCategoryKey(direction,name);
     const inserted=await sql`INSERT INTO public.kc_categories(user_id,name,direction,canonical_key) VALUES(${owner.id},${name},${direction},${key}) RETURNING id`;
     const catId=inserted[0]?.id;
     if(catId&&direction==="expense"&&x.limit!==undefined&&x.limit!==null&&x.limit!==""){
      const limitCents=amount(x.limit,true,false);
      const targetMonth=isValidMonth(x.month)?x.month:brDay().slice(0,7);
      await sql`SELECT public.kc_upsert_budget_rule(${owner.id},${catId}::uuid,${limitCents},${targetMonth},true,NULL)`;
     }
     return send({saved:true,id:catId},201);
   }
   const parentName=textValue(x.parentName,80);
   if(!parentName)return error("Selecione uma categoria antes de adicionar subcategoria.");
   const parent=await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${direction} AND parent_id IS NULL AND name=${parentName} LIMIT 1`;
   if(!parent.length && !allowedRoot(direction,parentName))return error("Categoria não encontrada.",404);
   let parentId=parent[0]?.id;
   if(!parentId){
    await sql`INSERT INTO public.kc_categories(user_id,name,direction,canonical_key) VALUES(${owner.id},${parentName},${direction},${canonicalCategoryKey(direction,parentName)}) ON CONFLICT DO NOTHING`;
    const row=await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${direction} AND parent_id IS NULL AND name=${parentName} LIMIT 1`;
    parentId=row[0]?.id;
   }
   if(existingCats.some(c=>normalizeCategoryName(c.name)===normalized))return error("Essa subcategoria já está cadastrada.",409);
   const insertedSub=await sql`INSERT INTO public.kc_categories(user_id,name,direction,parent_id) VALUES(${owner.id},${name},${direction},${parentId}::uuid) RETURNING id`;
   return send({saved:true,id:insertedSub[0]?.id},201);
  }
  if(x.action==="budget"){
   if(!uuid(x.categoryId))return error("Categoria inválida.");
   const targetMonth=isValidMonth(x.month)?x.month:brDay().slice(0,7);
   const active=x.active!==false;
   const limitCents=active?amount(x.limit,true,false):0;
   const expectedVersion=Number.isInteger(x.expectedVersion)?x.expectedVersion:null;
   const rows=await sql`SELECT public.kc_upsert_budget_rule(${owner.id},${x.categoryId}::uuid,${limitCents},${targetMonth},${active},${expectedVersion}) AS info`;
   return send({saved:true,...rows[0]?.info},201);
  }
  if(x.action==="materialize"){
   const occ=decodeOccurrenceId(x.occurrenceId);
   if(!occ)return error("Ocorrência mensal inválida.");
   const rule=await sql`SELECT starts_on::text FROM public.kc_recurring_rules WHERE user_id=${owner.id} AND id=${occ.ruleId}::uuid LIMIT 1`;
   if(!rule.length)return error("Recorrência não encontrada.",404);
   const start=rule[0].starts_on;
   const index=(Number(occ.ym.slice(0,4))-Number(start.slice(0,4)))*12+
               Number(occ.ym.slice(5,7))-Number(start.slice(5,7))+1;
   if(!Number.isInteger(index)||index<1)return error("Ocorrência inválida.");
   const result=await sql`SELECT public.kc_materialize_recurring_occurrence(${owner.id},${occ.ruleId}::uuid,${index}) AS id`;
   return send({saved:true,id:result[0]?.id});
  }
  if(x.action==="title"){
   const description=textValue(x.description,140),category=textValue(x.category,70);
   if(!description||!category||!day(x.dueOn)||!["income","expense"].includes(x.direction)||!uuid(x.walletId))return error("Descrição, data, tipo, categoria ou conta inválidos.");
   const w=await sql`SELECT id FROM public.kc_wallets WHERE id=${x.walletId}::uuid AND user_id=${owner.id}`;
   if(!w.length)return error("Conta não encontrada.",404);
   let root=await sql`SELECT id,name FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${x.direction} AND parent_id IS NULL AND name=${category} LIMIT 1`;
   if(!root.length && allowedRoot(x.direction,category)){
    await seedDefaultCategories(owner.id);
    root=await sql`SELECT id,name FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${x.direction} AND parent_id IS NULL AND name=${category} LIMIT 1`;
   }
   if(!root.length)return error("Selecione uma categoria cadastrada.");
   const categoryId=root[0].id;
   const subcategory=x.subcategory?textValue(x.subcategory,70):null;
   if(x.subcategory&&!subcategory)return error("Subcategoria inválida.");
   let subcategoryId=null;
   if(subcategory){
     const subs=await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${x.direction} AND name=${subcategory} AND parent_id=${categoryId}::uuid LIMIT 1`;
     if(!subs.length)return error("Selecione uma subcategoria já cadastrada.");
     subcategoryId=subs[0].id;
   }
   const base=amount(x.amount);
   const mode=["single","installments","monthly"].includes(x.mode)?x.mode:"single";
   if(mode==="monthly"){
     if(x.dueOn>"2099-12-31")return error("Recorrência só é permitida até 2099.");
     const end=x.endsOn?String(x.endsOn):null;
     if(end&&(!day(end)||end<x.dueOn||end>"2099-12-31"))return error("Data final da recorrência inválida.");
     const rule=await sql`INSERT INTO public.kc_recurring_rules(user_id,wallet_id,direction,description,category,subcategory,category_id,subcategory_id,amount_cents,starts_on,ends_on)
      VALUES(${owner.id},${x.walletId}::uuid,${x.direction},${description},${category},${subcategory},${categoryId}::uuid,${subcategoryId}::uuid,${base},${x.dueOn}::date,${end}::date)
      RETURNING id`;
     return send({saved:true,recurringRuleId:rule[0]?.id,createdOccurrences:0},201);
   }
   const occurredOn=x.occurredOn?String(x.occurredOn):x.dueOn;
   if(!day(occurredOn))return error("Data da compra/competência inválida.");
   const settlementState=x.settlementState==="paid"?"paid":"pending";
   const settledOn=settlementState==="paid"?String(x.settledOn||occurredOn):null;
   if(settlementState==="paid"&&!validSettlementDay(settledOn,brDay()))return error("A baixa realizada não pode ter uma data futura.");
   const count=mode==="single"?1:Number(x.count);
   if(!Number.isInteger(count)||count<1||count>60)return error("Quantidade de parcelas inválida.");
   const start=mode==="installments"?Number(x.startIndex||1):1;
   if(!Number.isInteger(start)||start<1||start>count)return error("Parcela inicial inválida.");
   const perMode=x.valueMode==="installment"?"installment":"total";
   const idempotencyKey=uuid(x.idempotencyKey)?x.idempotencyKey:crypto.randomUUID();
   const rows=await sql`SELECT public.kc_create_financial_event(
    ${owner.id},${x.walletId}::uuid,${x.direction},${description},
    ${categoryId}::uuid,${subcategoryId}::uuid,${category},${subcategory},
    ${base},${occurredOn}::date,${x.dueOn}::date,${mode},${count},${start},${perMode},
    ${settlementState},${settledOn}::date,${idempotencyKey}::uuid
   ) AS info`;
   return send({saved:true,...rows[0]?.info},201);
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
  if(x.action==="reverse"){
    if(!uuid(x.settlementId))return error("Baixa inválida.");
    const reversal=await sql`SELECT public.kc_reverse_settlement(${owner.id},${x.settlementId}::uuid,'Reversão solicitada pelo titular') AS id`;
    return send({saved:true,reversedId:reversal[0]?.id});
  }
  if(x.action==="stop_recurring"){
   if(!uuid(x.ruleId)||!day(x.startsOn))return error("Regra ou data inválida.");
   const rule=await sql`SELECT starts_on::text FROM public.kc_recurring_rules WHERE user_id=${owner.id} AND id=${x.ruleId}::uuid LIMIT 1`;
   if(!rule.length)return error("Regra não encontrada.",404);
   const start=rule[0].starts_on;
   const index=(Number(x.startsOn.slice(0,4))-Number(start.slice(0,4)))*12+
                Number(x.startsOn.slice(5,7))-Number(start.slice(5,7))+1;
   if(index<1)return error("Data anterior à recorrência.");
   const result=await sql`SELECT public.kc_cancel_recurring_scope(${owner.id},${x.ruleId}::uuid,${index},'future') AS info`;
   return send({saved:true,...result[0]?.info});
  }
  if(x.action==="edit"){
   if(!uuid(x.titleId)||!uuid(x.walletId)||!day(x.dueOn)||!["income","expense"].includes(x.direction))return error("Título ou dados inválidos.");
   const description=textValue(x.description,140),category=textValue(x.category,70),subcategory=x.subcategory?textValue(x.subcategory,70):null;
   if(!description||!category||(x.subcategory&&!subcategory))return error("Descrição ou categoria inválida.");
   const account=await sql`SELECT id FROM public.kc_wallets WHERE user_id=${owner.id} AND id=${x.walletId}::uuid LIMIT 1`;
   if(!account.length)return error("Conta não encontrada.",404);
   let root=await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${x.direction} AND name=${category} AND parent_id IS NULL LIMIT 1`;
   if(!root.length && allowedRoot(x.direction,category)){
    await seedDefaultCategories(owner.id);
    root=await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${x.direction} AND name=${category} AND parent_id IS NULL LIMIT 1`;
   }
   if(!root.length)return error("Categoria inválida.");
   const categoryId=root[0].id;
   let subcategoryId=null;
   if(subcategory){
    const sub=await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${x.direction} AND name=${subcategory} AND parent_id=${categoryId}::uuid LIMIT 1`;
    if(!sub.length)return error("Subcategoria inválida.");
    subcategoryId=sub[0].id;
   }
   const value=amount(x.amount);
   const occurredOn=x.occurredOn&&day(x.occurredOn)?x.occurredOn:null;
   await sql`SELECT public.kc_edit_title_and_event(${owner.id},${x.titleId}::uuid,${x.walletId}::uuid,${x.direction},${description},${categoryId}::uuid,${subcategoryId}::uuid,${category},${subcategory},${value},${x.dueOn}::date,${occurredOn}::date)`;
   return send({saved:true,scope:"this-occurrence"});
  }
  if(x.action==="cancel_scope"){
   if(!validScope(x.scope))return error("Escolha uma opção de exclusão válida.");
   const virtual=decodeOccurrenceId(x.titleId);
   if(virtual){
    const rule=await sql`SELECT starts_on::text FROM public.kc_recurring_rules WHERE user_id=${owner.id} AND id=${virtual.ruleId}::uuid LIMIT 1`;
    if(!rule.length)return error("Recorrência não encontrada.",404);
    const index=(Number(virtual.ym.slice(0,4))-Number(rule[0].starts_on.slice(0,4)))*12+
      Number(virtual.ym.slice(5,7))-Number(rule[0].starts_on.slice(5,7))+1;
    if(!Number.isInteger(index)||index<1)return error("Ocorrência inválida.");
    const result=await sql`SELECT public.kc_cancel_recurring_scope(${owner.id},${virtual.ruleId}::uuid,${index},${x.scope}) AS info`;
    return send({saved:true,...result[0]?.info});
   }
   if(!uuid(x.titleId))return error("Lançamento inválido.");
   const title=await sql`SELECT id,series_id,recurrence,installment_index FROM public.kc_titles WHERE id=${x.titleId}::uuid AND user_id=${owner.id} AND cancelled_at IS NULL LIMIT 1`;
   if(!title.length)return error("Lançamento não encontrado.",404);
   if(title[0].series_id&&title[0].recurrence==="monthly"){
    const rule=await sql`SELECT id FROM public.kc_recurring_rules WHERE id=${title[0].series_id}::uuid AND user_id=${owner.id} LIMIT 1`;
    if(rule.length){
     const result=await sql`SELECT public.kc_cancel_recurring_scope(${owner.id},${rule[0].id}::uuid,${title[0].installment_index},${x.scope}) AS info`;
     return send({saved:true,...result[0]?.info});
    }
   }
   const result=await sql`SELECT public.kc_cancel_title_scope(${owner.id},${x.titleId}::uuid,${x.scope}) AS info`;
   await sql`SELECT public.kc_sync_cancelled_economic_events(${owner.id},${x.titleId}::uuid)`;
   return send({saved:true,...result[0]?.info});
  }
  if(x.action==="rename_category"){
   if(!uuid(x.categoryId))return error("Categoria inválida.");
   const name=textValue(x.name,80);
   if(!name)return error("Informe o novo nome da categoria.");
   const cat=await sql`SELECT id,direction,parent_id FROM public.kc_categories WHERE id=${x.categoryId}::uuid AND user_id=${owner.id} LIMIT 1`;
   if(!cat.length)return error("Categoria não encontrada.",404);
   const siblings=await sql`SELECT id,name FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${cat[0].direction} AND id<>${x.categoryId}::uuid LIMIT 300`;
   if(siblings.some(s=>normalizeCategoryName(s.name)===normalizeCategoryName(name)))return error("Já existe uma categoria com esse nome.",409);
   await sql`UPDATE public.kc_categories SET name=${name} WHERE id=${x.categoryId}::uuid AND user_id=${owner.id}`;
   return send({saved:true});
  }
  if(x.action==="cancel"){
   if(!uuid(x.titleId))return error("Título inválido.");
   const result=await sql`SELECT public.kc_cancel_title_scope(${owner.id},${x.titleId}::uuid,'only') AS info`;
   await sql`SELECT public.kc_sync_cancelled_economic_events(${owner.id},${x.titleId}::uuid)`;
   return send({saved:true,...result[0]?.info});
  }
  return error("Ação não reconhecida.");
 }catch(e){if(e?.message?.includes("Informe")||e?.message?.includes("Valor")||e?.message?.includes("exceeds"))return error("Valor maior que o saldo pendente.",409);if(e?.code==="22023"||e?.code==="P0002")return error(e?.message?.slice(0,180)||"Operação indisponível.",409);console.error("portfolio-patch",e?.name);return error("Falha na operação.",500);}
}
