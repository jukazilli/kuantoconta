import test from "node:test";
import assert from "node:assert/strict";
import {computeRange,lastDayOfMonth,moveMonth} from "./period.js";
const data={wallets:[{id:"w",opening_balance_cents:"0",opening_at:"2026-11-16T00:00:00Z"}],
titles:Array.from({length:10},(_,i)=>({id:String(i),direction:"income",wallet_id:"w",amount_cents:"240000",settled_cents:"0",category:"Salário",due_on:new Date(Date.UTC(2026,10+i,1)).toISOString().slice(0,10)})),
settlements:[],assets:[],liabilities:[]};
test("one monthly salary is R$2400, not R$24000 across ten months",()=>{
 const result=computeRange(data,"2027-01-01","2027-01-31","2026-11-17");
 assert.equal(result.receivable.total,240000);
 assert.equal(result.periodResult,240000);
});
test("selected date interval includes end and excludes the next period",()=>{
 const result=computeRange(data,"2026-11-17","2026-11-30","2026-11-17");
 assert.equal(result.receivable.total,0);
});
test("date range helpers handle December and leap year",()=>{
 assert.equal(lastDayOfMonth("2026-11-17"),"2026-11-30");
 assert.equal(lastDayOfMonth("2028-02-04"),"2028-02-29");
 assert.equal(moveMonth("2026-12-15",1),"2027-01");
});

test("monthly bar respects the exact date range, not the complete calendar month",()=>{
 const data2={...data,titles:[...data.titles,{direction:"expense",wallet_id:"w",category:"Outros",amount_cents:"5000",settled_cents:"0",due_on:"2026-11-05"}]};
 const r=computeRange(data2,"2026-11-17","2026-11-30","2026-11-17");
 assert.equal(r.payable.total,0);
 assert.equal(r.months[0].expense,0);
});

test("fully settled title remains in the due period exactly once",()=>{
 const withSettlement={...data,titles:[{...data.titles[0],settled_cents:"240000"}],settlements:[{title_id:"0",direction:"income",amount_cents:"240000",settled_on:"2026-11-17"}]};
 const r=computeRange(withSettlement,"2026-11-01","2026-11-30","2026-11-17");
 assert.equal(r.receivable.total,240000);
 assert.equal(r.receivable.paid,240000);
 assert.equal(r.receivable.open,0);
});
test("reversed settlement is absent from actuals, pending amount restored",()=>{
 const withReversal={...data,titles:[{...data.titles[0],settled_cents:"0"}],settlements:[{title_id:"0",direction:"income",amount_cents:"240000",settled_on:"2026-11-17",reversed_at:"2026-11-18T12:00:00Z"}]};
 const r=computeRange(withReversal,"2026-11-01","2026-11-30","2026-11-17");
 assert.equal(r.receivable.total,240000);
 assert.equal(r.receivable.paid,0);
 assert.equal(r.receivable.open,240000);
 assert.equal(r.liveCash,0);
});

test("Case G: within_budgets adds only residual budget, never double-counting committed expenses",()=>{
 const d={
  wallets:[{id:"w",opening_balance_cents:"100000",opening_at:"2026-11-01T00:00:00Z"}],
  categories:[{id:"c-food",name:"Alimentação",direction:"expense",parent_id:null,active:true}],
  budgetRules:[{id:"r1",category_id:"c-food",limit_cents:"40000",starts_month:"2026-11",active:true}],
  economicEvents:[{id:"e1",direction:"expense",description:"Mercado",amount_cents:"15980",occurred_on:"2026-11-17",category_id:"c-food",event_kind:"one_off",status:"committed"}],
  titles:[{id:"t1",economic_event_id:"e1",direction:"expense",wallet_id:"w",category:"Alimentação",amount_cents:"15980",settled_cents:"0",due_on:"2026-11-20"}],
  settlements:[],assets:[],liabilities:[]
 };
 const r=computeRange(d,"2026-11-17","2026-11-30","2026-11-17");
 // Contractual: 100000 - 15980 = 84020
 assert.equal(r.projectedCash,84020);
 // Within budgets: 100000 - 40000 = 60000 (residual 24020 added once, NOT 15980 + 40000!)
 assert.equal(r.totalResidualBudgetCents,24020);
 assert.equal(r.projectedCashWithinBudgets,60000);
});

test("Case H: remaining budget is never reported as safe-to-spend when cash goes negative",()=>{
 const d={
  wallets:[{id:"w",opening_balance_cents:"50000",opening_at:"2026-11-01T00:00:00Z"}],
  categories:[{id:"c-fun",name:"Lazer",direction:"expense",parent_id:null,active:true}],
  budgetRules:[{id:"r1",category_id:"c-fun",limit_cents:"10000",starts_month:"2026-11",active:true}],
  economicEvents:[],
  titles:[{id:"t-rent",direction:"expense",wallet_id:"w",category:"Moradia",amount_cents:"80000",settled_cents:"0",due_on:"2026-11-20"}],
  settlements:[],assets:[],liabilities:[]
 };
 const r=computeRange(d,"2026-11-17","2026-11-30","2026-11-17");
 assert.equal(r.minCash,-30000);
 assert.equal(r.safeToSpendCents,0);
 assert.equal(r.firstNegative,"2026-11-20");
});

test("Case F & 31/12 projection: pending income does not raise liveCash; net worth reconciles to Dec 31",()=>{
 const d={
  wallets:[{id:"w",opening_balance_cents:"100000",opening_at:"2026-11-01T00:00:00Z"}],
  categories:[{id:"c-food",name:"Alimentação",direction:"expense",parent_id:null,active:true}],
  budgetRules:[{id:"r1",category_id:"c-food",limit_cents:"40000",starts_month:"2026-11",active:true}],
  economicEvents:[],
  titles:[{id:"t-sal",direction:"income",wallet_id:"w",category:"Salário",amount_cents:"270000",settled_cents:"0",due_on:"2026-12-05"}],
  settlements:[],
  assets:[{id:"a1",label:"Reserva",value_cents:"500000"}],
  liabilities:[{id:"l1",label:"Financiamento",principal_cents:"200000"}]
 };
 const r=computeRange(d,"2026-11-17","2026-12-31","2026-11-17");
 assert.equal(r.liveCash,100000);
 assert.equal(r.projectedCash,370000);
 assert.equal(r.netWorthPartial,670000);
 // Residual budget for Nov (40000) + Dec (40000) = 80000
 assert.equal(r.totalResidualBudgetCents,80000);
 assert.equal(r.projectedCashWithinBudgets,290000);
 assert.equal(r.netWorthWithinBudgets,590000);
});
