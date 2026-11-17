// kuantoconta finance core. Monetary amounts are integer centavos.
export function cents(x){ const n=Number(x);return Number.isSafeInteger(n)?n:0; }
export function money(x){return cents(x).toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2});}
export function brDay(now=new Date()){
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return p.year+"-"+p.month+"-"+p.day;
}
export const isoDate = x=>String(x||"").slice(0,10);
export const monthOf = x=>isoDate(x).slice(0,7);
const dateValue=x=>new Date(x+"T12:00:00Z");
export function dayAdd(day,offset){const d=dateValue(day);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
function checkDate(day){return /^\d{4}-\d{2}-\d{2}$/.test(day)&&dateValue(day).toISOString().slice(0,10)===day;}
function sameUserWallet(settlement,wallet){return String(settlement.wallet_id)===String(wallet.id);}
export function compute(data, date, today=brDay()){
 const selected=checkDate(date)?date:today;
 const horizon=selected<today?today:selected;
 const wallets=data?.wallets||[], titles=data?.titles||[],settlements=data?.settlements||[];
 const unknownCash=wallets.length===0||wallets.some(w=>w.opening_balance_cents===null||w.opening_balance_cents===undefined||!w.opening_at);
 const opening=wallets.reduce((sum,w)=>sum+cents(w.opening_balance_cents),0);
 const posted=settlements.reduce((sum,s)=>{
   const wallet=wallets.find(w=>sameUserWallet(s,w));
   if(!wallet||!wallet.opening_at||new Date(s.created_at).getTime()<=new Date(wallet.opening_at).getTime())return sum;
   return sum+(s.direction==="income"?1:-1)*cents(s.amount_cents);
 },0);
 const liveCash=unknownCash?null:opening+posted;
 const future=new Map();
 for(const t of titles){
   const due=isoDate(t.due_on);
   const rest=Math.max(0,cents(t.amount_cents)-cents(t.settled_cents));
   if(rest===0||!checkDate(due))continue;
   const effective=due<today?today:due;
   if(effective>horizon)continue;
   future.set(effective,(future.get(effective)||0)+(t.direction==="income"?1:-1)*rest);
 }
 const daily=[];let running=liveCash;let firstNegative=null;let minCash=liveCash;
 if(liveCash!==null){
   for(let d=today,i=0;d<=horizon&&i<=1100;d=dayAdd(d,1),i++){
     running+=(future.get(d)||0);
     if(running<0&&!firstNegative)firstNegative=d;
     minCash=Math.min(minCash,running);
     daily.push({date:d,balance:running});
   }
 }
 const targetMonth=monthOf(horizon);
 const periodTitles=titles.filter(t=>monthOf(t.due_on)===targetMonth);
 const periodSettlements=settlements.filter(s=>monthOf(s.settled_on)===targetMonth);
 const totals=(kind)=>{
   const open=periodTitles.filter(t=>t.direction===kind).reduce((v,t)=>v+Math.max(0,cents(t.amount_cents)-cents(t.settled_cents)),0);
   const paid=periodSettlements.filter(s=>s.direction===kind).reduce((v,s)=>v+cents(s.amount_cents),0);
   return {open,paid,total:open+paid};
 };
 const recv=totals("income"),pay=totals("expense");
 const categoryTotals={};
 for(const t of periodTitles.filter(t=>t.direction==="expense")){
   categoryTotals[t.category||"Outros"]=(categoryTotals[t.category||"Outros"]||0)+Math.max(0,cents(t.amount_cents)-cents(t.settled_cents));
 }
 for(const s of periodSettlements.filter(s=>s.direction==="expense")){
   categoryTotals[s.category||"Outros"]=(categoryTotals[s.category||"Outros"]||0)+cents(s.amount_cents);
 }
 const months=[];
 for(let y=+today.slice(0,4),m=+today.slice(5,7),n=0;n<36;n++){
   const ym=String(y)+"-"+String(m).padStart(2,"0");
   if(ym>monthOf(horizon))break;
   const tt=titles.filter(t=>monthOf(t.due_on)===ym);
   const ss=settlements.filter(s=>monthOf(s.settled_on)===ym);
   const amount=(kind)=>tt.filter(t=>t.direction===kind).reduce((v,t)=>v+Math.max(0,cents(t.amount_cents)-cents(t.settled_cents)),0)+ss.filter(s=>s.direction===kind).reduce((v,s)=>v+cents(s.amount_cents),0);
   const lastDaily=daily.filter(d=>monthOf(d.date)===ym).at(-1);
   months.push({month:ym,income:amount("income"),expense:amount("expense"),result:amount("income")-amount("expense"),balance:lastDaily?.balance??null});
   m++;if(m>12){m=1;y++;}
 }
 const assets=(data?.assets||[]).reduce((v,a)=>v+cents(a.value_cents),0);
 const liabilities=(data?.liabilities||[]).reduce((v,a)=>v+cents(a.principal_cents),0);
 const allPayable=titles.filter(t=>t.direction==="expense").reduce((v,t)=>v+Math.max(0,cents(t.amount_cents)-cents(t.settled_cents)),0);
 const allReceivable=titles.filter(t=>t.direction==="income").reduce((v,t)=>v+Math.max(0,cents(t.amount_cents)-cents(t.settled_cents)),0);
 return {today,date:horizon,targetMonth,knownCash:!unknownCash,liveCash,projectedCash:running,netWorthPartial:running===null?null:running+assets-liabilities,assets,liabilities,allPayable,allReceivable,receivable:recv,payable:pay,periodResult:recv.total-pay.total,categoryTotals,months,daily,firstNegative,minCash};
}
