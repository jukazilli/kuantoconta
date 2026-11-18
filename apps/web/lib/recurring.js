// Virtual monthly titles: one database rule, occurrences calculated only for the requested horizon.
// Explicit materialized titles and cancellation tombstones always override virtual occurrences.
import {isoDate,cents} from "./finance.js";
const validYm=ym=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(ym));
export function shiftMonth(anchor,months){
 const [y,m,d]=isoDate(anchor).split("-").map(Number);
 if(!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(d))return null;
 const date=new Date(Date.UTC(y,m-1+months,1));
 const end=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
 date.setUTCDate(Math.min(d,end));
 return date.toISOString().slice(0,10);
}
export function monthsBetween(first,second){
 const a=isoDate(first),b=isoDate(second);
 return (+b.slice(0,4)- +a.slice(0,4))*12+(+b.slice(5,7)- +a.slice(5,7));
}
export function occurrenceId(ruleId,day){return "rec:"+ruleId+":"+isoDate(day).slice(0,7);}
export function decodeOccurrenceId(id){
 const match=/^rec:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}):(\d{4}-(?:0[1-9]|1[0-2]))$/i.exec(String(id||""));
 return match?{ruleId:match[1],ym:match[2]}:null;
}
export function occurrenceForMonth(rule,ym){
 if(!validYm(ym))return null;
 const start=isoDate(rule.starts_on),until=isoDate(rule.ends_on||"2099-12-31");
 const offset=monthsBetween(start,ym+"-01");
 if(offset<0)return null;
 const day=shiftMonth(start,offset);
 if(day<start||day>until||rule.paused_at&&day>=isoDate(rule.paused_at))return null;
 return {
  id:occurrenceId(rule.id,day),virtual:true,series_id:rule.id,
  installment_index:offset+1,installment_total:1,
  recurrence:"monthly",wallet_id:rule.wallet_id,direction:rule.direction,
  description:rule.description,category:rule.category,subcategory:rule.subcategory,
  amount_cents:String(cents(rule.amount_cents)),settled_cents:"0",due_on:day,
  created_at:rule.created_at
 };
}
export function expandRecurring(data,start,end){
 const from=isoDate(start),to=isoDate(end);
 const titles=[...(data?.titles||[])],rules=data?.recurringRules||[];
 const overridden=new Set([...titles,...(data?.cancelledRecurring||[])].filter(t=>t.series_id).map(t=>String(t.series_id)+":"+String(t.installment_index)));
 const first=from.slice(0,7),last=to.slice(0,7);
 const virtual=[];
 if(!validYm(first)||!validYm(last)||first>last)return {...data,titles};
 for(const rule of rules){
  const firstOffset=Math.max(0,monthsBetween(rule.starts_on,first+"-01"));
  const lastOffset=Math.min(monthsBetween(rule.starts_on,last+"-01"),monthsBetween(rule.starts_on,"2099-12-01"));
  for(let n=firstOffset;n<=lastOffset;n++){
   const day=shiftMonth(rule.starts_on,n);
   const v=occurrenceForMonth(rule,day.slice(0,7));
   if(!v||v.due_on<from||v.due_on>to||overridden.has(rule.id+":"+(n+1)))continue;
   virtual.push(v);
  }
 }
 return {...data,titles:titles.concat(virtual)};
}
