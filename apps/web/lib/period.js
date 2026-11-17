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
 const titles=data?.titles||[],settlements=(data?.settlements||[]).filter(s=>!s.reversed_at);
 // Due-date plan: each title counts once in its period, regardless of payment date.
 // Settlements affect actual cash and paid/open status, not the planned month's size.
 const total=direction=>{
   const relevant=titles.filter(t=>t.direction===direction&&inRange(t.due_on,from,to));
   return {open:relevant.reduce((n,t)=>n+Math.max(0,cents(t.amount_cents)-cents(t.settled_cents)),0),
    paid:relevant.reduce((n,t)=>n+cents(t.settled_cents),0),
    total:relevant.reduce((n,t)=>n+cents(t.amount_cents),0)};
 };
 const recv=total("income"),pay=total("expense");
 const categoryTotals={};
 for(const t of titles.filter(t=>t.direction==="expense"&&inRange(t.due_on,from,to))){
   const category=t.category||"Outros";
   categoryTotals[category]=(categoryTotals[category]||0)+cents(t.amount_cents);
 }
 const months=full.months.filter(m=>m.month>=monthOf(from)&&m.month<=monthOf(to)).map(m=>{
   const tx=titles.filter(t=>monthOf(t.due_on)===m.month&&inRange(t.due_on,from,to));
   const amount=kind=>tx.filter(t=>t.direction===kind).reduce((n,t)=>n+cents(t.amount_cents),0);
   const income=amount("income"),expense=amount("expense");
   return {...m,income,expense,result:income-expense};
 });
 const overdue=titles.filter(t=>isoDate(t.due_on)<from&&cents(t.amount_cents)>cents(t.settled_cents));
 return {...full,periodStart:from,periodEnd:to,receivable:recv,payable:pay,periodResult:recv.total-pay.total,categoryTotals,months,overdueCount:overdue.length,projectedCash:to<today?null:full.projectedCash,netWorthPartial:to<today?null:full.netWorthPartial};
}
