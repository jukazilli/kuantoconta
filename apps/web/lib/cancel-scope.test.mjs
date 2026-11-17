import test from "node:test";
import assert from "node:assert/strict";
import {CANCELLATION_SCOPES,cancelOptionList,scopeContains,effectOnTitle} from "./cancel-scope.js";
const row=(n,paid=0)=>({series_id:"s",recurrence:"installments",installment_index:n,amount_cents:30000,settled_cents:paid});
test("one-off only allows one deletion scope",()=>{
 assert.deepEqual(cancelOptionList({...row(1),series_id:null}),[CANCELLATION_SCOPES[0]]);
 assert.equal(cancelOptionList(row(1)).length,3);
});
test("only targets exactly one installment",()=>{
 assert.deepEqual([1,2,3,4].filter(n=>scopeContains("only",n,2)),[2]);
});
test("future keeps earlier occurrences",()=>{
 assert.deepEqual([1,2,3,4].filter(n=>scopeContains("future",n,2)),[2,3,4]);
});
test("all includes earlier unpaid obligations",()=>{
 assert.deepEqual([1,2,3,4].filter(n=>scopeContains("all",n,2)),[1,2,3,4]);
});
test("cash already received is preserved; partial remainder is cancelled with audit",()=>{
 assert.equal(effectOnTitle(row(2,30000),{scope:"all",selectedIndex:2}),"preserve-settled");
 assert.equal(effectOnTitle(row(2,12000),{scope:"future",selectedIndex:2}),"cancel-pending-and-audit");
 assert.equal(effectOnTitle(row(2,0),{scope:"only",selectedIndex:2}),"cancel-unpaid-and-audit");
 assert.equal(effectOnTitle(row(1,0),{scope:"future",selectedIndex:2}),"untouched");
});
