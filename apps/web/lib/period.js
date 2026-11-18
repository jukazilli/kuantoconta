import {compute,cents,brDay,monthOf,isoDate} from "./finance.js";
import {computeBudgetSummary} from "./budgets.js";
import {enrichSpendingPlans} from "./spending-plans.js";

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
 const titles=data?.titles||[];
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

 // Spending plans (with_plans scenario) + unallocated budget residual (within_budgets scenario)
 // LC-12/LC-13/LC-14/LC-15:
 // - Dated spending plans hit expected_payment_on || planned_for (not EOM).
 // - Undated spending plans conservatively hit max(today, firstDayOfMonth(planned_month)) with hasUndatedPlans=true.
 // - within_budgets adds ONLY unallocated residual max(0, L - R - C - P) so plans/committed/realized are never double-counted.
 const enrichedPlans=enrichSpendingPlans(
   data?.spendingPlans||[],
   data?.spendingPlanApplications||[],
   today,
   data?.economicEvents||[]
 );
 const plansByDay=new Map();
 let totalPlannedRemainingCents=0;
 let hasUndatedPlans=false;
 for(const p of enrichedPlans){
   if(!p.active||p.remainingCents<=0)continue;
   const rawDay=p.expected_payment_on||p.planned_for||null;
   if(!rawDay)hasUndatedPlans=true;
   const targetDay=rawDay?isoDate(rawDay):(p.planned_month+"-01");
   const effectiveDay=targetDay<today?today:targetDay;
   if(effectiveDay<=full.date){
     plansByDay.set(effectiveDay,(plansByDay.get(effectiveDay)||0)+p.remainingCents);
     totalPlannedRemainingCents+=p.remainingCents;
   }
 }

 const residualByDay=new Map();
 const budgetByMonth=new Map();
 for(const m of full.months){
   const summary=computeBudgetSummary({
     month:m.month,
     categories:data?.categories||[],
     budgetRules:data?.budgetRules||[],
     budgetPeriods:data?.budgetPeriods||[],
     economicEvents:data?.economicEvents||[],
     titles,
     recurringRules:data?.recurringRules||[],
     cancelledRecurring:data?.cancelledRecurring||[],
     spendingPlans:data?.spendingPlans||[],
     spendingPlanApplications:data?.spendingPlanApplications||[],
     today
   });
   budgetByMonth.set(m.month,summary);
   const monthUnallocatedResidual=summary.reduce(
     (acc,b)=>acc+(b.unallocatedCents!==null?Math.max(0,b.unallocatedCents):0),
     0
   );
   if(monthUnallocatedResidual>0){
     const eom=lastDayOfMonth(m.month+"-01");
     const effectiveDay=eom<today?today:eom;
     if(effectiveDay<=full.date){
       residualByDay.set(effectiveDay,(residualByDay.get(effectiveDay)||0)+monthUnallocatedResidual);
     }
   }
 }

 let cumulativePlans=0;
 let cumulativeResidual=0;
 let minCashWithPlans=full.knownCash?full.liveCash:null;
 let firstNegativeWithPlans=null;
 let minCashWithinBudgets=full.knownCash?full.liveCash:null;
 let firstNegativeWithinBudgets=null;
 const dailyWithPlans=[];
 const lastWithPlansByMonth=new Map();
 const lastWithinByMonth=new Map();
 for(const d of full.daily){
   cumulativePlans+=(plansByDay.get(d.date)||0);
   cumulativeResidual+=(residualByDay.get(d.date)||0);
   const balWithPlans=d.balance-cumulativePlans;
   const balWithin=balWithPlans-cumulativeResidual;
   dailyWithPlans.push({date:d.date,balance:balWithPlans});
   if(balWithPlans<0&&!firstNegativeWithPlans)firstNegativeWithPlans=d.date;
   minCashWithPlans=minCashWithPlans===null?balWithPlans:Math.min(minCashWithPlans,balWithPlans);
   if(balWithin<0&&!firstNegativeWithinBudgets)firstNegativeWithinBudgets=d.date;
   minCashWithinBudgets=minCashWithinBudgets===null?balWithin:Math.min(minCashWithinBudgets,balWithin);
   lastWithPlansByMonth.set(monthOf(d.date),balWithPlans);
   lastWithinByMonth.set(monthOf(d.date),balWithin);
 }

 const projectedCashWithPlans=to<today||full.projectedCash===null?null:full.projectedCash-cumulativePlans;
 const projectedCashWithinBudgets=to<today||full.projectedCash===null?null:full.projectedCash-cumulativePlans-cumulativeResidual;
 const netWorthWithinBudgets=projectedCashWithinBudgets===null?null:projectedCashWithinBudgets+full.assets-full.liabilities;
 const safeToSpendCents=!full.knownCash?null:Math.max(0,full.minCash??0);

 const months=full.months.filter(m=>m.month>=monthOf(from)&&m.month<=monthOf(to)).map(m=>{
   const tx=titles.filter(t=>monthOf(t.due_on)===m.month&&inRange(t.due_on,from,to));
   const amount=kind=>tx.filter(t=>t.direction===kind).reduce((n,t)=>n+cents(t.amount_cents),0);
   const income=amount("income"),expense=amount("expense");
   return {...m,income,expense,result:income-expense,balanceWithPlans:lastWithPlansByMonth.get(m.month)??null,balanceWithinBudgets:lastWithinByMonth.get(m.month)??null};
 });
 const overdue=titles.filter(t=>isoDate(t.due_on)<from&&cents(t.amount_cents)>cents(t.settled_cents));
 const targetMonth=monthOf(to);
 const budgetSummary=budgetByMonth.get(targetMonth)||computeBudgetSummary({
   month:targetMonth,
   categories:data?.categories||[],
   budgetRules:data?.budgetRules||[],
   budgetPeriods:data?.budgetPeriods||[],
   economicEvents:data?.economicEvents||[],
   titles,
   recurringRules:data?.recurringRules||[],
   cancelledRecurring:data?.cancelledRecurring||[],
   spendingPlans:data?.spendingPlans||[],
   spendingPlanApplications:data?.spendingPlanApplications||[],
   today
 });

 return {
   ...full,
   periodStart:from,
   periodEnd:to,
   receivable:recv,
   payable:pay,
   periodResult:recv.total-pay.total,
   categoryTotals,
   months,
   overdueCount:overdue.length,
   projectedCash:to<today?null:full.projectedCash,
   netWorthPartial:to<today?null:full.netWorthPartial,
   dailyWithPlans,
   projectedCashWithPlans,
   minCashWithPlans:to<today?null:minCashWithPlans,
   firstNegativeWithPlans:to<today?null:firstNegativeWithPlans,
   totalPlannedRemainingCents,
   hasUndatedPlans,
   projectedCashWithinBudgets,
   netWorthWithinBudgets,
   minCashWithinBudgets:to<today?null:minCashWithinBudgets,
   firstNegativeWithinBudgets:to<today?null:firstNegativeWithinBudgets,
   totalResidualBudgetCents:cumulativeResidual,
   safeToSpendCents,
   budgetSummary
 };
}
