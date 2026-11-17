// Rules shared by UI and tests; server ultimately enforces all scopes atomically.
export const CANCELLATION_SCOPES=Object.freeze([
 {value:"only",label:"Somente este lançamento",description:"Mantém as demais parcelas ou mensalidades."},
 {value:"future",label:"Este e todos os seguintes",description:"Cancela o restante da série a partir desta ocorrência."},
 {value:"all",label:"Todos os lançamentos",description:"Cancela toda a série, preservando as movimentações já realizadas."}
]);
export const validScope=s=>CANCELLATION_SCOPES.some(x=>x.value===s);
export const isSeries=t=>Boolean(t?.series_id)&&["monthly","installments"].includes(t?.recurrence);
export const cancelOptionList=title=>isSeries(title)?CANCELLATION_SCOPES:[CANCELLATION_SCOPES[0]];
export function scopeContains(scope,index,selected){
 if(!validScope(scope)||!Number.isInteger(index)||!Number.isInteger(selected))return false;
 return scope==="all"||scope==="future"&&index>=selected||scope==="only"&&index===selected;
}
export function effectOnTitle(title,{scope,selectedIndex}){
 if(!scopeContains(scope,title.installment_index,selectedIndex))return "untouched";
 const amount=Number(title.amount_cents),paid=Number(title.settled_cents);
 if(paid===amount)return "preserve-settled";
 return paid>0?"cancel-pending-and-audit":"cancel-unpaid-and-audit";
}
