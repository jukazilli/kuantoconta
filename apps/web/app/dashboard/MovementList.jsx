"use client";
import {useState} from "react";
import {Clock3,CheckCircle2,MoreHorizontal,ArrowDownLeft,ArrowUpRight} from "lucide-react";
import {cents,money,isoDate} from "../../lib/finance";
import {isSeries} from "../../lib/cancel-scope";
const formatDate=d=>{const s=isoDate(d).split("-");return s.length===3?s[2]+"/"+s[1]+"/"+s[0]:"—";};
const monthName=d=>new Date(isoDate(d).slice(0,7)+"-15T12:00:00Z").toLocaleDateString("pt-BR",{month:"long",year:"numeric",timeZone:"UTC"});
function State({title,today}){
 const remaining=cents(title.amount_cents)-cents(title.settled_cents);
 const status=remaining===0?"Quitado":cents(title.settled_cents)>0?"Parcial":isoDate(title.due_on)<today?"Vencido":"Pendente";
 return <span className={"status "+(status==="Quitado"?"done":status==="Parcial"?"partial":status==="Vencido"?"late":"pending")}>{status}</span>;
}
export default function MovementList({items,compact=false,today,walletName,onDetails,onAction}){
 const [opened,setOpened]=useState(null);
 if(!items?.length)return <div className="empty-movements">Nenhum lançamento neste período. Use + A pagar ou + A receber para começar.</div>;
 let previousMonth="";
 return <div className={"movements-list"+(compact?" compact":"")}>
 {items.map(t=>{
   const month=isoDate(t.due_on).slice(0,7);
   const showGroup=!compact&&previousMonth!==month;
   previousMonth=month;
   const remaining=Math.max(0,cents(t.amount_cents)-cents(t.settled_cents));
   return <div key={t.id}>
    {showGroup&&<h3 className="movement-group">{monthName(t.due_on)}</h3>}
    <article className="movement-item">
     <button type="button" className={"movement-direction "+t.direction} title={remaining===0?"Ver título quitado":"Baixa rápida"} aria-label={remaining===0?"Ver detalhes do título quitado":"Efetivar baixa rápida de "+t.description} onClick={()=>remaining===0?onDetails(t.id):onAction("settle",t.id)}>{remaining===0?<CheckCircle2 size={21}/>:<Clock3 size={20}/>}</button>
     <button type="button" className="movement-main" onClick={()=>{setOpened(null);onDetails(t.id);}} aria-label={"Ver detalhes de "+t.description}>
      <span className="movement-wallet">{walletName(t.wallet_id)}</span>
      <strong>{t.description}</strong>
      <span className="movement-taxonomy"><span className="movement-tag">{t.category}</span>{t.subcategory&&<span className="movement-tag secondary">{t.subcategory}</span>}{t.installment_total>1&&<span className="movement-installment">{t.installment_index}/{t.installment_total}</span>}</span>
     </button>
     <div className="movement-right"><span className="movement-due">{formatDate(t.due_on)}</span><strong className={t.direction==="income"?"movement-income":""}>{money(cents(t.amount_cents))}</strong><State title={t} today={today}/></div>
     <div className="movement-menu-anchor">
      <button type="button" className="movement-more" aria-expanded={opened===t.id} aria-label={"Opções de "+t.description} onClick={()=>setOpened(opened===t.id?null:t.id)}><MoreHorizontal size={22}/></button>
      {opened===t.id&&<div className="movement-menu" role="menu">
       {[["detail","Ver detalhes"],["edit","Editar lançamento"],["duplicate","Duplicar"],...(remaining>0?[["settle","Baixa total ou parcial"]]:[]),...((remaining>0||isSeries(t))?[["cancel","Excluir lançamento"]]:[])].map(([action,label])=><button type="button" role="menuitem" key={action} className={action==="cancel"?"danger":""} onClick={()=>{setOpened(null);onAction(action,t.id);}}>{label}</button>)}
      </div>}
     </div>
    </article>
   </div>;
 })}
 </div>;
}
