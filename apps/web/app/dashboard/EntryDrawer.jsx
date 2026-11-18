"use client";
import {useState} from "react";
import {X,Plus,CalendarDays,ReceiptText,CircleDollarSign,Repeat2,CheckCircle2,Clock3,Wallet} from "lucide-react";
import MoneyInput from "./MoneyInput";
import {cents,money,isoDate,brDay} from "../../lib/finance";
import {maskToCents} from "../../lib/money-input";
import {isSeries} from "../../lib/cancel-scope";
const fdate=d=>{const s=isoDate(d).split("-");return s.length===3?s[2]+"/"+s[1]+"/"+s[0]:"—";};
export default function EntryDrawer({drawer,form,setForm,selectedTitleObj,settlements=[],wallets=[],categories=[],rules=[],cancellations=[],busy,error,onSave,onClose,onAction,onAddCategory}){
 const [quick,setQuick]=useState(null),[newName,setNewName]=useState(""),[quickError,setQuickError]=useState(""),[quickBusy,setQuickBusy]=useState(false);
 const field=(name,value)=>setForm(old=>({...old,[name]:value}));
 const edit=drawer==="edit",newTitle=drawer==="title",titleEntry=newTitle||edit;
 const roots=categories.filter(c=>c.direction===form.direction&&c.parent_id===null);
 const activeRoot=roots.find(c=>c.name===form.category);
 const subs=categories.filter(c=>c.direction===form.direction&&c.parent_id&&String(c.parent_id)===String(activeRoot?.id));
 const balanceDue=selectedTitleObj?Math.max(0,cents(selectedTitleObj.amount_cents)-cents(selectedTitleObj.settled_cents)):0;
 const amountValue=()=>{try{return maskToCents(form.amount);}catch{return 0;}};
 async function createCategory(e){
  e.preventDefault();setQuickError("");
  if(!newName.trim()){setQuickError("Informe um nome.");return;}
  setQuickBusy(true);
  try{
    await onAddCategory({name:newName.trim(),direction:form.direction,parentName:quick==="subcategory"?form.category:null});
    if(quick==="category")setForm(old=>({...old,category:newName.trim(),subcategory:""}));
    else field("subcategory",newName.trim());
    setQuick(null);setNewName("");
  }catch(e){setQuickError(e.message||"Não foi possível cadastrar.");}
  finally{setQuickBusy(false);}
 }
 const formTitle=drawer==="title"?(form.direction==="income"?"Nova receita":"Nova despesa"):drawer==="edit"?"Editar lançamento":drawer==="wallet"?"Nova conta":drawer==="settle"?"Baixar título":drawer==="detail"?"Detalhes do título":drawer==="asset"?"Novo ativo":"Nova dívida";
 const canSubmit=drawer!=="detail";
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="drawer" role="dialog" aria-modal="true" aria-label={formTitle}>
   <header className="drawer-head"><button type="button" className="plain-icon" onClick={onClose} aria-label="Fechar"><X size={23}/></button><h2>{formTitle}</h2>{canSubmit?<button className="save-pill" form="entry-form" type="submit" disabled={busy}>{busy?"Salvando...":"Salvar"}</button>:<span className="drawer-head-spacer"/>}</header>
   {error&&<div className="notice error" role="alert" style={{margin:"14px 20px"}}>{error}</div>}
   {drawer==="detail"?<div className="detail-layout">
    <div className="detail-amount"><small>{selectedTitleObj?.direction==="income"?"A receber":"A pagar"}</small><strong>{money(cents(selectedTitleObj?.amount_cents))}</strong><p>{selectedTitleObj?.description}</p></div>
    <dl className="detail-fields">
      <div><dt>Conta</dt><dd>{wallets.find(w=>w.id===selectedTitleObj?.wallet_id)?.name||"—"}</dd></div>
      <div><dt>Categoria</dt><dd>{selectedTitleObj?.category||"—"}</dd></div>
      <div><dt>Subcategoria</dt><dd>{selectedTitleObj?.subcategory||"Sem subcategoria"}</dd></div>
      <div><dt>Vencimento</dt><dd>{fdate(selectedTitleObj?.due_on)}</dd></div>
      <div><dt>Parcela</dt><dd>{selectedTitleObj?.installment_total>1?selectedTitleObj.installment_index+"/"+selectedTitleObj.installment_total:"Única / fixa"}</dd></div>
      <div><dt>Valor original</dt><dd>{money(cents(selectedTitleObj?.amount_cents))}</dd></div>
      <div><dt>Já efetivado</dt><dd>{money(cents(selectedTitleObj?.settled_cents))}</dd></div>
      <div className="strong"><dt>Saldo pendente</dt><dd>{money(balanceDue)}</dd></div>
    </dl>
    <div className="detail-actions"><button className="dark-button" disabled={balanceDue===0} onClick={()=>onAction("settle",selectedTitleObj.id)}>Baixa total ou parcial</button><button className="light-button" onClick={()=>onAction("edit",selectedTitleObj.id)}>Editar esta ocorrência</button></div>
    {cancellations.some(c=>c.title_id===selectedTitleObj?.id)&&<div className="editing-scope-note">
      <strong>Cancelamento parcial registrado</strong>
      <p>Valor original antes do cancelamento: {money(cents(cancellations.find(c=>c.title_id===selectedTitleObj?.id)?.original_amount_cents))}</p>
      <p>Valor pendente cancelado: {money(cents(cancellations.find(c=>c.title_id===selectedTitleObj?.id)?.cancelled_pending_cents))}</p>
      <p>Pagamentos e recebimentos efetuados foram preservados no histórico.</p>
    </div>}
    {(balanceDue>0||isSeries(selectedTitleObj))&&<button type="button" className="text-button" onClick={()=>onAction("cancel",selectedTitleObj.id)}>Excluir este lançamento ou sua série</button>}
    <div className="detail-history"><h3>Histórico de baixas</h3>{settlements.filter(s=>s.title_id===selectedTitleObj?.id).length?settlements.filter(s=>s.title_id===selectedTitleObj?.id).map(s=><div className={"history-row"+(s.reversed_at?" reversed":"")} key={s.id}><p><CheckCircle2 size={15}/>{fdate(s.settled_on)} — {money(cents(s.amount_cents))} {s.reversed_at&&<span>• Revertida</span>}</p>{!s.reversed_at&&<button type="button" disabled={busy} onClick={()=>onAction("reverse",s.id)}>Desfazer baixa</button>}</div>):<p><Clock3 size={15}/> Nenhuma baixa registrada.</p>}</div>

    <p className="hint">Ao editar esta ocorrência, as demais parcelas da série não serão alteradas.</p>
   </div>:<form id="entry-form" className="entry-form" onSubmit={onSave}>
    {titleEntry&&<><div className="field-row major"><ReceiptText/><input aria-label="Descrição do lançamento" placeholder="Descrição" required value={form.description} maxLength={120} onChange={e=>field("description",e.target.value)}/></div>
      <div className="field-row money-input"><CircleDollarSign/><span>R$</span><MoneyInput ariaLabel="Valor em reais" value={form.amount} onChange={v=>field("amount",v)}/></div>
      {edit?<div className="editing-scope-note">A alteração será aplicada <strong>somente a este lançamento</strong>. Outras parcelas permanecem como estão.</div>:
      <><div className="field-row"><Repeat2/><label><small>Repetição</small><select value={form.mode} onChange={e=>field("mode",e.target.value)}><option value="single">Não recorrente</option><option value="installments">Parcelar ou repetir</option><option value="monthly">Fixa mensal (até 2099)</option></select></label></div>
      {form.mode==="installments"&&<div className="repeat-config"><div className="section-header"><h3>Configurar repetição</h3><span>Parcelas mensais</span></div>
      <div className="form-grid"><label>Começar na parcela<input type="number" min="1" max={form.count} value={form.startIndex} onChange={e=>field("startIndex",e.target.value)}/></label><label>Total de parcelas<input type="number" min="2" max="60" value={form.count} onChange={e=>field("count",e.target.value)}/></label></div>
      <label>O valor informado representa<select value={form.valueMode} onChange={e=>field("valueMode",e.target.value)}><option value="total">Valor total da operação</option><option value="installment">Valor de cada parcela</option></select></label>
      <div className="repeat-preview"><strong>{Math.max(0,Number(form.count)-Number(form.startIndex)+1)||0} parcelas futuras</strong><span>{form.valueMode==="installment"?"Valor mensal: "+money(amountValue()):"Valor do contrato: "+money(amountValue())}</span></div></div>}
      {form.mode==="monthly"&&<div className="repeat-config"><strong>Recorrência sem prazo de término</strong><p>Uma única regra será salva. As próximas parcelas são calculadas sob demanda até 2099.</p><label>Encerrar em (opcional)<input type="date" min={form.dueOn} max="2099-12-31" value={form.endsOn||""} onChange={ev=>field("endsOn",ev.target.value)}/></label></div>}
      </>}
      <div className="field-row"><CalendarDays/><label><small>Data de vencimento</small><input required type="date" value={form.dueOn} onChange={e=>field("dueOn",e.target.value)}/></label></div>
      <div className="form-group">
        <div className="controlled-classification"><label>Categoria<select required value={form.category} onChange={e=>setForm(old=>({...old,category:e.target.value,subcategory:""}))}><option value="">Selecione</option>{roots.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select></label><button type="button" className="inline-plus" aria-label="Criar categoria" onClick={()=>{setQuick("category");setNewName("");setQuickError("");}}><Plus size={20}/></button></div>
        <div className="controlled-classification"><label>Subcategoria<select value={form.subcategory||""} onChange={e=>field("subcategory",e.target.value)}><option value="">Sem subcategoria</option>{subs.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}{form.subcategory&&!subs.some(c=>c.name===form.subcategory)&&<option value={form.subcategory} disabled>{form.subcategory} (legado)</option>}</select></label><button type="button" className="inline-plus" aria-label="Criar subcategoria" disabled={!form.category} onClick={()=>{setQuick("subcategory");setNewName("");setQuickError("");}}><Plus size={20}/></button></div>
        <label>Conta<select required value={form.walletId} onChange={e=>field("walletId",e.target.value)}><option value="">Selecione uma conta</option>{wallets.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      </div>
      {!wallets.length&&<p className="hint">Cadastre uma conta antes de registrar receitas ou despesas.</p>}
      {newTitle&&<label className="tick"><input type="checkbox" checked={form.keepOpen} onChange={e=>field("keepOpen",e.target.checked)}/> Salvar e continuar</label>}
    </>}
    {drawer==="wallet"&&<><p className="hint">O saldo de abertura representa a posição real da conta na data do cadastro.</p><label>Nome da conta<input required maxLength={90} value={form.name} onChange={e=>field("name",e.target.value)} placeholder="Ex.: Conta principal"/></label><label>Saldo de abertura (R$)<MoneyInput value={form.balance} allowNegative onChange={v=>field("balance",v)} ariaLabel="Saldo de abertura"/></label><label className="tick"><input type="checkbox" checked={String(form.balance).startsWith("-")} onChange={e=>field("balance",e.target.checked?"-"+(form.balance||"0,00").replace("-",""):(form.balance||"0,00").replace("-",""))}/> Saldo negativo (devedor)</label></>}
    {drawer==="settle"&&<><p className="hint">Confirmar o valor pago ou recebido. A parte restante permanece pendente.</p><div className="settle-title">{selectedTitleObj?.description}<small>Saldo em aberto: {money(balanceDue)}</small></div><label>Valor efetivado (R$)<MoneyInput value={form.amount} onChange={v=>field("amount",v)} ariaLabel="Valor efetivado em reais"/></label><label>Data da efetivação<input required type="date" max={brDay()} value={form.settledOn} onChange={e=>field("settledOn",e.target.value)}/></label></>}
    {(drawer==="asset"||drawer==="liability")&&<><label>Descrição<input required maxLength={120} placeholder={drawer==="asset"?"Ex.: veículo":"Ex.: empréstimo"} value={form.label} onChange={e=>field("label",e.target.value)}/></label><label>Valor atual (R$)<MoneyInput value={form.amount} onChange={v=>field("amount",v)} ariaLabel="Valor atual"/></label><p className="hint">Não inclua novamente o dinheiro já registrado em uma conta.</p></>}
   </form>}
   {quick&&<div className="nested-overlay"><form className="quick-category" onSubmit={createCategory}><div className="quick-head"><h3>{quick==="category"?"Nova categoria":"Nova subcategoria"}</h3><button type="button" aria-label="Fechar" onClick={()=>setQuick(null)}><X size={20}/></button></div>{quick==="subcategory"&&<p>Dentro de {form.category}</p>}<label>Nome<input required maxLength={80} autoFocus value={newName} onChange={e=>setNewName(e.target.value)} placeholder={quick==="subcategory"?"Ex.: Mercado":"Ex.: Educação"}/></label>{quickError&&<div className="notice error" role="alert">{quickError}</div>}<button type="submit" className="dark-button" disabled={quickBusy}>{quickBusy?"Salvando...":"Adicionar"}</button></form></div>}
 </section></div>;
}
