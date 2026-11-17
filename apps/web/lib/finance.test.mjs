import test from "node:test";
import assert from "node:assert/strict";
import {compute,validSettlementDay} from "./finance.js";
const base={wallets:[{id:"a",opening_balance_cents:"200000",opening_at:"2026-11-16T12:00:00Z"}],titles:[
 {wallet_id:"a",direction:"income",amount_cents:"400000",settled_cents:"0",due_on:"2026-12-05",category:"Salário"},
 {wallet_id:"a",direction:"expense",amount_cents:"100000",settled_cents:"0",due_on:"2026-12-01",category:"Moradia"}
],settlements:[],assets:[],liabilities:[]};
test("without a known opening balance, cash is not invented",()=>{const r=compute({...base,wallets:[]}, "2026-12-31","2026-11-16");assert.equal(r.liveCash,null);assert.equal(r.projectedCash,null);});
test("forecast detects negative cash before a later receipt",()=>{const r=compute({...base,wallets:[{...base.wallets[0],opening_balance_cents:"20000"}]},"2026-12-31","2026-11-16");assert.equal(r.firstNegative,"2026-12-01");assert.equal(r.projectedCash,320000);});
test("paid title portion is not also forecast",()=>{const t={...base.titles[0],settled_cents:"100000"};const r=compute({...base,titles:[t],settlements:[{wallet_id:"a",direction:"income",amount_cents:"100000",settled_on:"2026-11-17",created_at:"2026-11-17T12:00:00Z",category:"Salário"}]},"2026-12-31","2026-11-16");assert.equal(r.projectedCash,600000);});
test("partial title remains as an open obligation",()=>{const r=compute({...base,titles:[{...base.titles[1],settled_cents:"30000"}]},"2026-12-31","2026-11-16");assert.equal(r.allPayable,70000);});
test("settlements after wallet snapshot adjust actual cash",()=>{const r=compute({...base,titles:[],settlements:[{wallet_id:"a",direction:"expense",amount_cents:"20000",settled_on:"2026-11-17",created_at:"2026-11-17T12:00:00Z"}]},"2026-12-31","2026-11-16");assert.equal(r.liveCash,180000);});
test("net worth subtracts liabilities only once from cash and additional assets",()=>{const r=compute({...base,titles:[],assets:[{value_cents:"1000000"}],liabilities:[{principal_cents:"500000"}]},"2026-12-31","2026-11-16");assert.equal(r.netWorthPartial,700000);});

test("negative opening balance remains negative and generates an immediate cash warning",()=>{
 const x=compute({...base,wallets:[{...base.wallets[0],opening_balance_cents:"-50000"}],titles:[]},"2026-11-20","2026-11-16");
 assert.equal(x.liveCash,-50000);
 assert.equal(x.firstNegative,"2026-11-16");
});
test("future settlements cannot be classified as completed now",()=>{
 assert.equal(validSettlementDay("2026-11-17","2026-11-16"),false);
 assert.equal(validSettlementDay("2026-11-16","2026-11-16"),true);
 assert.equal(validSettlementDay("2026-02-30","2026-11-16"),false);
 assert.equal(validSettlementDay("2026-99-99","2026-11-16"),false);
});

test("monthly recurring expenses do not become lifetime contractual debt",()=>{
 const x=compute({...base,titles:[{...base.titles[1],recurrence:"monthly",virtual:true,amount_cents:"100000"}]},"2026-12-31","2026-11-16");
 assert.equal(x.allPayable,0);
});
