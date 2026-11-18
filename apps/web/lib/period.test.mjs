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
