import {compute,cents,brDay,monthOf,isoDate} from "./finance.js";
export function lastDayOfMonth(iso){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso)))return iso;
 const [y,m]=iso.split("-").map(Number);
 return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
}
export function firstDayOfMonth(iso){return String(iso).slice(0,7)+"-01";}
export function moveMonth(iso,delta){
 const [y,m]=String(iso).slice(0,7).split("-").map(Number);
 const day=new Date(Date.UTC(y,m-1+delta,1));
 return day.toISOString().slice(0,7);
}
export const inRange=(day,start,end)=>isoDate(day)>=start&&isoDate(day)<=end;
export function computeRange(data,start,end,today=brDay()){
 const from=start<=end?start:end,to=end>=start?end:start;
 const full=compute(data,to,today);
 const titles=data?.titles||[],settlements=data?.settlements||[];
 const total=direction=>{
   const pending=titles.filter(t=>t.direction===direction&&inRange(t.due_on,from,to)).reduce((n,t)=>n+Math.max(0,cents(t.amount_cents)-cents(t.settled_cents)),0);
   const settled=settlements.filter(s=>s.direction===direction&&inRange(s.settled_on,from,to)).reduce((n,s)=>n+cents(s.amount_cents),0);
   return {open:pending,paid:settled,total:pending+settled};
 };
 const recv=total("income"),pay=total("expense");
 const categoryTotals={};
 for(const t of titles.filter(t=>t.direction==="expense"&&inRange(t.due_on,from,to))){
   const c=t.category||"Outros";
   categoryTotals[c]=(categoryTotals[c]||0)+Math.max(0,cents(t.amount_cents)-cents(t.settled_cents));
 }
 for(const s of settlements.filter(s=>s.direction==="expense"&&inRange(s.settled_on,from,to))){
   const c=s.category||"Outros";
   categoryTotals[c]=(categoryTotals[c]||0)+cents(s.amount_cents);
 }
 const months=full.months.filter(m=>m.month>=monthOf(from)&&m.month<=monthOf(to));
 const overdue=titles.filter(t=>isoDate(t.due_on)<from&&cents(t.amount_cents)>cents(t.settled_cents));
 return {...full,periodStart:from,periodEnd:to,receivable:recv,payable:pay,periodResult:recv.total-pay.total,categoryTotals,months,overdueCount:overdue.length,projectedCash:to<today?null:full.projectedCash,netWorthPartial:to<today?null:full.netWorthPartial};
}
