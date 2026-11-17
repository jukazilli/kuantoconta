import test from "node:test";
import assert from "node:assert/strict";
import {shiftMonth,monthsBetween,occurrenceForMonth,expandRecurring,decodeOccurrenceId} from "./recurring.js";
const rule={id:"11111111-1111-4111-8111-111111111111",wallet_id:"w",direction:"expense",amount_cents:"30800",description:"Faculdade",category:"Educação",starts_on:"2026-01-31",ends_on:null};
test("one compact rule projects end of month until 2099",()=>{
 assert.equal(shiftMonth("2026-01-31",1),"2026-02-28");
 assert.equal(shiftMonth("2028-01-31",1),"2028-02-29");
 assert.equal(occurrenceForMonth(rule,"2099-12").amount_cents,"30800");
 assert.equal(occurrenceForMonth(rule,"2100-01"),null);
});
test("only dates in query interval are projected; no DB insertion",()=>{
 const r=expandRecurring({titles:[],recurringRules:[rule]},"2026-11-17","2026-12-31");
 assert.equal(r.titles.length,2);
 assert.deepEqual(r.titles.map(x=>x.due_on),["2026-11-30","2026-12-31"]);
});
test("materialized or cancelled occurrence prevents virtual duplicate",()=>{
 const real={series_id:rule.id,installment_index:11,due_on:"2026-11-30",amount_cents:"32000"};
 const excluded={series_id:rule.id,installment_index:12};
 const r=expandRecurring({titles:[real],cancelledRecurring:[excluded],recurringRules:[rule]},"2026-11-01","2026-12-31");
 assert.equal(r.titles.length,1);
});
test("virtual ID is scoped to a monthly occurrence",()=>{
 const id="rec:"+rule.id+":2026-11";
 assert.deepEqual(decodeOccurrenceId(id),{ruleId:rule.id,ym:"2026-11"});
 assert.equal(decodeOccurrenceId("rec:trash"),null);
});
test("recurring date relative month index is deterministic",()=>{
 assert.equal(monthsBetween("2026-11-17","2028-02-01"),15);
});
