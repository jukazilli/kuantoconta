"use client";
import {useEffect,useState} from "react";
import {X,AlertTriangle} from "lucide-react";
import {CANCELLATION_SCOPES,cancelOptionList,isSeries} from "../../lib/cancel-scope";
import {cents,money} from "../../lib/finance";
export default function CancelScopeDialog({title,busy=false,error="",onCancel,onConfirm}){
 const options=cancelOptionList(title);
 const [scope,setScope]=useState("only");
 useEffect(()=>setScope("only"),[title?.id]);
 if(!title)return null;
 const paid=cents(title.settled_cents),full=paid>=cents(title.amount_cents);
 const multiple=isSeries(title);
 const selected=options.find(x=>x.value===scope);
 const invalid=full&&scope==="only";
 return <div className="cancel-dialog-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onCancel();}}>
 <section role="dialog" aria-modal="true" aria-labelledby="cancel-title" className="cancel-scope-dialog">
 <header className="cancel-dialog-header"><h2 id="cancel-title">Excluir lançamento</h2><button aria-label="Fechar" type="button" disabled={busy} onClick={onCancel}><X size={21}/></button></header>
 <div className="cancel-context"><strong>{title.description}</strong><span>{money(cents(title.amount_cents))} · {title.direction==="income"?"Receita":"Despesa"}</span></div>
 <p className="cancel-explainer">{multiple?"Esta receita ou despesa pertence a uma série. Escolha quais ocorrências devem ser excluídas.":"Este lançamento não faz parte de uma série."}</p>
 <fieldset className="cancel-scope-options"><legend>Quais lançamentos excluir?</legend>
 {options.map(opt=><label className={"cancel-scope-option"+(scope===opt.value?" selected":"")} key={opt.value}>
 <input type="radio" name="cancel-scope" checked={scope===opt.value} onChange={()=>setScope(opt.value)} disabled={busy}/>
 <span><strong>{opt.label}</strong><small>{opt.description}</small></span>
 </label>)}</fieldset>
 <div className="cancel-policy"><AlertTriangle size={17}/><p>{full&&scope==="only"?"Este título já está totalmente baixado. Desfaça a baixa antes de cancelar somente esta ocorrência.":"Pagamentos e recebimentos já realizados serão preservados. Somente valores pendentes serão cancelados. A operação ficará registrada no histórico."}</p></div>
 {error&&<div className="notice error" role="alert">{error}</div>}
 <footer className="cancel-actions"><button className="light-button" type="button" disabled={busy} onClick={onCancel}>Voltar</button><button className="cancel-confirm" type="button" disabled={busy||invalid} onClick={()=>onConfirm(scope)}>{busy?"Excluindo...":"Confirmar exclusão"}</button></footer>
 </section></div>;
}
