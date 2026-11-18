import test from "node:test";
import assert from "node:assert/strict";
import {maskMoney,maskToDecimal,maskToCents,centsToMask} from "./money-input.js";
test("type only digits into an automatically shifting BRL mask",()=>{
 const seq=["3","30","308","3080","30800"].map(maskMoney);
 assert.deepEqual(seq,["0,03","0,30","3,08","30,80","308,00"]);
 assert.equal(maskToDecimal("308,00"),"308.00");
 assert.equal(maskToCents("308,00"),30800);
});
test("round-trip from title cents to editable masked display",()=>{
 assert.equal(centsToMask(30800),"308,00");
 assert.equal(centsToMask(19000),"190,00");
 assert.equal(maskToDecimal(centsToMask(30800)),"308.00");
});
test("remove letters and punctuation without creating financial value",()=>{
 assert.equal(maskMoney("ana308,00"),"308,00");
 assert.equal(maskMoney(""),"");
 assert.equal(maskToCents("2.400,00"),240000);
});
test("negative balances retain their sign",()=>{
 assert.equal(centsToMask(-30000),"-300,00");
 assert.equal(maskToDecimal("-300,00",{allowNegative:true}),"-300.00");
});
