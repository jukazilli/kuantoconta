"use client";
import {useMemo,useState} from "react";
import {X,Plus,CalendarDays,ReceiptText,CircleDollarSign,Repeat2,CheckCircle2,Clock3,ChevronDown,ChevronRight,Sparkles} from "lucide-react";
import MoneyInput from "./MoneyInput";
import {cents,money,isoDate,brDay} from "../../lib/finance";
import {maskToCents,maskToDecimal} from "../../lib/money-input";
import {isSeries} from "../../lib/cancel-scope";
import {findMatchingSpendingPlans,computePlanRemainingCents} from "../../lib/spending-plans";

const fdate=d=>{const s=isoDate(d).split("-");return s.length===3?`${s[2]}/${s[1]}/${s[0]}`:"—";};

export default function EntryDrawer({
  drawer,
  form,
  setForm,
  selectedTitleObj,
  settlements=[],
  wallets=[],
  categories=[],
  budgets=[],
  monthlyIncomeCents=0,
  spendingPlans=[],
  spendingPlanApplications=[],
  busy,
  error,
  onSave,
  onClose,
  onAction,
  onAddCategory,
  cancellations=[]
}){
 const [quick,setQuick]=useState(null),[newName,setNewName]=useState(""),[trackBudget,setTrackBudget]=useState(false),[quickLimit,setQuickLimit]=useState(""),[quickError,setQuickError]=useState(""),[quickBusy,setQuickBusy]=useState(false),[showMore,setShowMore]=useState(false);
 const field=(name,value)=>setForm(old=>({...old,[name]:value}));
 const edit=drawer==="edit",newTitle=drawer==="title",editPlan=drawer==="edit_plan",titleEntry=newTitle||edit;
 const intent=newTitle?(form.intent||"spent"):"bill";
 const roots=categories.filter(c=>c.direction===form.direction&&c.parent_id===null);
 const activeRoot=roots.find(c=>c.name===form.category);
 const balanceDue=selectedTitleObj?Math.max(0,cents(selectedTitleObj.amount_cents)-cents(selectedTitleObj.settled_cents)):0;
 const amountValue=()=>{try{return maskToCents(form.amount);}catch{return 0;}};

 const formatBudgetOption=name=>{
  if(form.direction!=="expense")return name;
  const b=budgets.find(x=>x.categoryName===name);
  if(!b||b.limitCents===null)return `${name} (não controla limite)`;
  const rem=b.remainingLimitCents??b.remainingCents??0;
  return rem<0?`${name} (estourado: ${money(rem)})`:`${name} (restam ${money(rem)})`;
 };

 // Discrete reconciliation suggestion when recording a real expense ("Gastei") matching an active spending plan (LC-21)
 const matchingPlans=useMemo(()=>{
  if(!newTitle||intent!=="spent"||!activeRoot?.id)return [];
  return findMatchingSpendingPlans({
    plans:spendingPlans,
    applications:spendingPlanApplications,
    categoryId:activeRoot.id,
    occurredOn:form.occurredOn||brDay(),
    today:brDay()
  });
 },[newTitle,intent,activeRoot,spendingPlans,spendingPlanApplications,form.occurredOn]);

 const suggestedPlan=matchingPlans[0]||null;
 const linkedPlan=form.spendingPlanId?spendingPlans.find(p=>String(p.id)===String(form.spendingPlanId)):null;
 const linkedRemaining=linkedPlan?computePlanRemainingCents(linkedPlan,spendingPlanApplications):0;
 const partialLeftover=linkedPlan&&amountValue()>0&&amountValue()<linkedRemaining?linkedRemaining-amountValue():0;

 function selectIntent(next){
  setShowMore(false);
  if(next==="spent"){
   setForm(old=>({...old,intent:"spent",direction:"expense",category:old.direction==="expense"?old.category:"",mode:"single",settlementState:"paid",occurredOn:old.occurredOn||brDay(),settledOn:old.settledOn||brDay(),dueOn:old.dueOn||brDay()}));
  }else if(next==="plan"){
   setForm(old=>({...old,intent:"plan",direction:"expense",category:old.direction==="expense"?old.category:"",mode:"single",plannedMonth:old.plannedMonth||brDay().slice(0,7),plannedFor:old.plannedFor||"",spendingPlanId:""}));
  }else{
   setForm(old=>({...old,intent:"bill",settlementState:"pending",mode:old.mode==="single"?"single":old.mode,spendingPlanId:""}));
  }
 }

 function selectBillDirection(dir){
  setForm(old=>({
   ...old,
   direction:dir,
   category:"",
   settlementState:"pending"
  }));
 }

 async function createCategory(e){
  e.preventDefault();setQuickError("");
  if(!newName.trim()){setQuickError("Informe um nome.");return;}
  if(form.direction==="expense"&&trackBudget){
   if(monthlyIncomeCents<=0){setQuickError("Cadastre seus valores a receber deste mês antes de definir um limite.");return;}
   if(!quickLimit){setQuickError("Informe o limite mensal.");return;}
  }
  setQuickBusy(true);
  try{
    const extra=form.direction==="expense"&&trackBudget?{limit:maskToDecimal(quickLimit),month:(form.occurredOn||brDay()).slice(0,7)}:{};
    await onAddCategory({name:newName.trim(),direction:form.direction,...extra});
    setForm(old=>({...old,category:newName.trim()}));
    setQuick(null);setNewName("");setTrackBudget(false);setQuickLimit("");
  }catch(e){setQuickError(e.message||"Não foi possível cadastrar.");}
  finally{setQuickBusy(false);}
 }

 const formTitle=
  newTitle?(intent==="spent"?"Gastei":intent==="plan"?"Vou gastar":form.direction==="income"?"Tenho uma conta a receber":"Tenho uma conta a pagar"):
  drawer==="edit"?"Editar lançamento":
  drawer==="edit_plan"?"Ajustar previsão de gasto":
  drawer==="wallet"?"Nova conta":
  drawer==="transfer_capital"?"Aporte para Carteira de Capital":
  drawer==="settle"?"Confirmar pagamento":
  drawer==="detail"?"Detalhes do lançamento":
  drawer==="budget"?"Configurar orçamento":
  drawer==="asset"?"Novo ativo":"Nova dívida";

 const canSubmit=drawer!=="detail";
 const checkingWallets=wallets.filter(w=>!w.is_reserved&&w.wallet_kind!=="reserve"&&w.wallet_kind!=="investment");
 const capitalWallets=wallets.filter(w=>w.is_reserved||w.wallet_kind==="reserve"||w.wallet_kind==="investment");

 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="drawer" role="dialog" aria-modal="true" aria-label={formTitle}>
   <header className="drawer-head"><button type="button" className="plain-icon" onClick={onClose} aria-label="Fechar"><X size={23}/></button><h2>{formTitle}</h2>{canSubmit?<button className="save-pill" form="entry-form" type="submit" disabled={busy}>{busy?"Salvando...":"Salvar"}</button>:<span className="drawer-head-spacer"/>}</header>
   {error&&<div className="notice error" role="alert" style={{margin:"14px 20px"}}>{error}</div>}
   {drawer==="detail"?<div className="detail-layout">
    <div className="detail-amount"><small>{selectedTitleObj?.direction==="income"?"A receber":"A pagar"}</small><strong>{money(cents(selectedTitleObj?.amount_cents))}</strong><p>{selectedTitleObj?.description}</p></div>
    <dl className="detail-fields">
      <div><dt>Conta</dt><dd>{wallets.find(w=>w.id===selectedTitleObj?.wallet_id)?.name||"—"}</dd></div>
      <div><dt>{selectedTitleObj?.direction==="income"?"Categoria":"Orçamento"}</dt><dd>{selectedTitleObj?.category||"—"}</dd></div>
      <div><dt>Vencimento</dt><dd>{fdate(selectedTitleObj?.due_on)}</dd></div>
      <div><dt>Parcela</dt><dd>{selectedTitleObj?.installment_total>1?selectedTitleObj.installment_index+"/"+selectedTitleObj.installment_total:"Única / fixa"}</dd></div>
      <div><dt>Valor original</dt><dd>{money(cents(selectedTitleObj?.amount_cents))}</dd></div>
      <div><dt>Já efetivado</dt><dd>{money(cents(selectedTitleObj?.settled_cents))}</dd></div>
      <div className="strong"><dt>Saldo pendente</dt><dd>{money(balanceDue)}</dd></div>
    </dl>
    <div className="detail-actions"><button className="dark-button" disabled={balanceDue===0} onClick={()=>onAction("settle",selectedTitleObj.id)}>Confirmar pagamento</button><button className="light-button" onClick={()=>onAction("edit",selectedTitleObj.id)}>Editar este lançamento</button></div>
    {cancellations.some(c=>c.title_id===selectedTitleObj?.id)&&<div className="editing-scope-note">
      <strong>Cancelamento parcial registrado</strong>
      <p>Valor original antes do cancelamento: {money(cents(cancellations.find(c=>c.title_id===selectedTitleObj?.id)?.original_amount_cents))}</p>
      <p>Valor pendente cancelado: {money(cents(cancellations.find(c=>c.title_id===selectedTitleObj?.id)?.cancelled_pending_cents))}</p>
      <p>Pagamentos e recebimentos efetuados foram preservados no histórico.</p>
    </div>}
    {(balanceDue>0||isSeries(selectedTitleObj))&&<button type="button" className="text-button" onClick={()=>onAction("cancel",selectedTitleObj.id)}>Excluir este lançamento ou sua série</button>}
    <div className="detail-history"><h3>Histórico de pagamentos</h3>{settlements.filter(s=>s.title_id===selectedTitleObj?.id).length?settlements.filter(s=>s.title_id===selectedTitleObj?.id).map(s=><div className={"history-row"+(s.reversed_at?" reversed":"")} key={s.id}><p><CheckCircle2 size={15}/>{fdate(s.settled_on)} — {money(cents(s.amount_cents))} {s.reversed_at&&<span>• Revertido</span>}</p>{!s.reversed_at&&<button type="button" disabled={busy} onClick={()=>onAction("reverse",s.id)}>Desfazer pagamento</button>}</div>):<p><Clock3 size={15}/> Nenhum pagamento registrado.</p>}</div>
    <p className="hint">Ao editar este lançamento, as demais parcelas da série não serão alteradas.</p>
   </div>:<form id="entry-form" className="entry-form" onSubmit={onSave}>
    {newTitle&&<div className="intent-tabs" role="tablist" aria-label="Tipo de registro">
      <button type="button" role="tab" aria-selected={intent==="spent"} className={intent==="spent"?"active":""} onClick={()=>selectIntent("spent")}>Gastei</button>
      <button type="button" role="tab" aria-selected={intent==="plan"} className={intent==="plan"?"active":""} onClick={()=>selectIntent("plan")}>Vou gastar</button>
      <button type="button" role="tab" aria-selected={intent==="bill"} className={intent==="bill"?"active":""} onClick={()=>selectIntent("bill")}>Tenho uma conta</button>
    </div>}

    {/* ACTION 2: VOU GASTAR (spending plan) */}
    {newTitle&&intent==="plan"&&<>
      <p className="hint">Apenas uma previsão de gasto. Não cria conta a pagar nem reduz seu saldo.</p>
      <div className="field-row money-input"><CircleDollarSign/><span>R$</span><MoneyInput ariaLabel="Valor estimado em reais" value={form.amount} onChange={v=>field("amount",v)}/></div>
      <div className="field-row major"><ReceiptText/><input aria-label="O que pretende gastar" placeholder="Ex.: Mercado, Presente" required value={form.description} maxLength={120} onChange={e=>field("description",e.target.value)}/></div>
      <div className="form-group">
        <div className="controlled-classification"><label>Orçamento<select required value={form.category} onChange={e=>field("category",e.target.value)}><option value="">Selecione</option>{roots.map(c=><option key={c.id} value={c.name}>{formatBudgetOption(c.name)}</option>)}</select></label><button type="button" className="inline-plus" aria-label="Criar orçamento" onClick={()=>{setQuick("category");setNewName("");setQuickError("");}}><Plus size={20}/></button></div>
        <div className="form-grid">
          <label>Mês previsto<input required type="month" value={form.plannedMonth||brDay().slice(0,7)} onChange={e=>setForm(old=>({...old,plannedMonth:e.target.value,plannedFor:""}))}/></label>
          <label>Dia previsto (opcional)<input type="date" value={form.plannedFor||""} onChange={e=>setForm(old=>({...old,plannedFor:e.target.value,plannedMonth:e.target.value?e.target.value.slice(0,7):old.plannedMonth}))}/></label>
        </div>
      </div>
    </>}

    {/* ACTION 1: GASTEI (Valor + Descrição + Orçamento + Conta) */}
    {newTitle&&intent==="spent"&&<>
      <div className="field-row money-input"><CircleDollarSign/><span>R$</span><MoneyInput ariaLabel="Valor em reais" value={form.amount} onChange={v=>field("amount",v)}/></div>
      <div className="field-row major"><ReceiptText/><input aria-label="Onde ou com o quê" placeholder="Onde ou com o quê? (ex.: Uber, Padaria)" required value={form.description} maxLength={120} onChange={e=>field("description",e.target.value)}/></div>
      <div className="form-group">
        <div className="controlled-classification"><label>De qual orçamento sai?<select required value={form.category} onChange={e=>setForm(old=>({...old,category:e.target.value,spendingPlanId:""}))}><option value="">Selecione o orçamento</option>{roots.map(c=><option key={c.id} value={c.name}>{formatBudgetOption(c.name)}</option>)}</select></label><button type="button" className="inline-plus" aria-label="Criar orçamento" onClick={()=>{setQuick("category");setNewName("");setQuickError("");}}><Plus size={20}/></button></div>
        <div className="form-grid" role="group" aria-label="Como vai pagar">
          <label className="tick"><input type="radio" name="settlementState" checked={form.settlementState==="paid"} onChange={()=>field("settlementState","paid")}/> Já paguei</label>
          <label className="tick"><input type="radio" name="settlementState" checked={form.settlementState!=="paid"} onChange={()=>field("settlementState","pending")}/> Vou pagar depois</label>
        </div>
        {form.settlementState!=="paid"&&<div className="field-row"><CalendarDays/><label><small>Data do pagamento</small><input required type="date" value={form.dueOn} onChange={e=>field("dueOn",e.target.value)}/></label></div>}
        <label>Conta<select required value={form.walletId} onChange={e=>field("walletId",e.target.value)}><option value="">Selecione uma conta</option>{wallets.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      </div>

      {/* Discrete reconciliation suggestion (LC-21 / LC-03 / LC-04) */}
      {(linkedPlan||suggestedPlan)&&<div className="plan-suggest-box">
        <div className="plan-suggest-head"><Sparkles size={15}/><strong>Essa compra corresponde a "{(linkedPlan||suggestedPlan).description}" ({money(cents((linkedPlan||suggestedPlan).estimated_amount_cents))})?</strong></div>
        <div className="plan-suggest-actions">
          <button type="button" className={form.spendingPlanId?"active":""} onClick={()=>setForm(old=>({...old,spendingPlanId:(linkedPlan||suggestedPlan).id,closeSpendingPlan:true}))}>Sim, usar previsão</button>
          <button type="button" className={!form.spendingPlanId?"active":""} onClick={()=>field("spendingPlanId","")}>Não, é outra compra</button>
        </div>
        {form.spendingPlanId&&<>
          {partialLeftover>0&&<small style={{fontSize:12,color:"#4a5248"}}>Restariam {money(partialLeftover)} nessa previsão — escolha se deseja encerrar ou manter o restante:</small>}
          <div className="form-grid" style={{marginTop:8}}>
            <label className="tick"><input type="radio" name="closePlan" checked={form.closeSpendingPlan!==false} onChange={()=>field("closeSpendingPlan",true)}/> Encerrar previsão</label>
            <label className="tick"><input type="radio" name="closePlan" checked={form.closeSpendingPlan===false} onChange={()=>field("closeSpendingPlan",false)}/> Ainda vou gastar o restante</label>
          </div>
        </>}
      </div>}

      <button type="button" className="text-button" onClick={()=>setShowMore(v=>!v)}>
        {showMore?<ChevronDown size={15}/>:<ChevronRight size={15}/>} Mais opções (data, parcelas)
      </button>
      {showMore&&<div className="repeat-config">
        <div className="field-row"><CalendarDays/><label><small>Data da compra</small><input type="date" value={form.occurredOn||brDay()} onChange={e=>field("occurredOn",e.target.value)}/></label></div>
        {form.settlementState==="paid"&&<div className="field-row"><CalendarDays/><label><small>Data do pagamento</small><input type="date" max={brDay()} value={form.settledOn||brDay()} onChange={e=>field("settledOn",e.target.value)}/></label></div>}
        {form.settlementState!=="paid"&&<div className="form-grid"><label>Total de parcelas<input type="number" min="1" max="60" value={form.mode==="installments"?form.count:"1"} onChange={e=>{const n=Number(e.target.value);setForm(old=>({...old,mode:n>1?"installments":"single",count:String(n)}));}}/></label><label>Valor informado<select value={form.valueMode} onChange={e=>field("valueMode",e.target.value)}><option value="total">Valor total</option><option value="installment">Por parcela</option></select></label></div>}
      </div>}
      {!wallets.length&&<p className="hint">Cadastre uma conta antes de registrar gastos.</p>}
    </>}

    {/* ACTION 3: TENHO UMA CONTA (A pagar | A receber) or edit */}
    {titleEntry&&(!newTitle||intent==="bill")&&<>
      {newTitle&&<div className="form-grid" role="group" aria-label="Tipo da conta">
        <label className="tick"><input type="radio" name="billDirection" checked={form.direction!=="income"} onChange={()=>selectBillDirection("expense")}/> A pagar</label>
        <label className="tick"><input type="radio" name="billDirection" checked={form.direction==="income"} onChange={()=>selectBillDirection("income")}/> A receber</label>
      </div>}
      <div className="field-row major"><ReceiptText/><input aria-label="Descrição do lançamento" placeholder={form.direction==="income"?"Ex.: Salário, Reembolso":"Ex.: Aluguel, Energia"} required value={form.description} maxLength={120} onChange={e=>field("description",e.target.value)}/></div>
      <div className="field-row money-input"><CircleDollarSign/><span>R$</span><MoneyInput ariaLabel="Valor em reais" value={form.amount} onChange={v=>field("amount",v)}/></div>
      {edit?<div className="editing-scope-note">A alteração será aplicada <strong>somente a este lançamento</strong>. Outras parcelas permanecem como estão.</div>:
      <><div className="field-row"><Repeat2/><label><small>Repetição</small><select value={form.mode} onChange={e=>field("mode",e.target.value)}><option value="single">Conta única</option><option value="monthly">Repete todo mês</option><option value="installments">Parcelada</option></select></label></div>
      {form.mode==="installments"&&<div className="repeat-config"><div className="section-header"><h3>Configurar parcelas</h3><span>Mensais</span></div>
      <div className="form-grid"><label>Começar na parcela<input type="number" min="1" max={form.count} value={form.startIndex} onChange={e=>field("startIndex",e.target.value)}/></label><label>Total de parcelas<input type="number" min="2" max="60" value={form.count} onChange={e=>field("count",e.target.value)}/></label></div>
      <label>O valor informado representa<select value={form.valueMode} onChange={e=>field("valueMode",e.target.value)}><option value="total">Valor total da operação</option><option value="installment">Valor de cada parcela</option></select></label>
      <div className="repeat-preview"><strong>{Math.max(0,Number(form.count)-Number(form.startIndex)+1)||0} parcelas futuras</strong><span>{form.valueMode==="installment"?"Valor mensal: "+money(amountValue()):"Valor total: "+money(amountValue())}</span></div></div>}
      {form.mode==="monthly"&&<div className="repeat-config"><strong>Conta recorrente</strong><p>As próximas ocorrências são projetadas automaticamente sem precisar recadastrar.</p><label>Encerrar em (opcional)<input type="date" min={form.dueOn} max="2099-12-31" value={form.endsOn||""} onChange={ev=>field("endsOn",ev.target.value)}/></label></div>}
      </>}
      {newTitle&&form.direction==="income"&&form.mode==="single"&&<div className="form-grid" role="group" aria-label="Situação da receita">
        <label className="tick"><input type="radio" name="settlementState" checked={form.settlementState!=="paid"} onChange={()=>field("settlementState","pending")}/> A receber</label>
        <label className="tick"><input type="radio" name="settlementState" checked={form.settlementState==="paid"} onChange={()=>field("settlementState","paid")}/> Já recebido</label>
      </div>}
      {newTitle&&form.direction==="income"&&form.mode==="single"&&form.settlementState==="paid"?
        <div className="field-row"><CalendarDays/><label><small>Data do recebimento</small><input required type="date" max={brDay()} value={form.settledOn||brDay()} onChange={e=>field("settledOn",e.target.value)}/></label></div>:
        <div className="field-row"><CalendarDays/><label><small>Data de vencimento</small><input required type="date" value={form.dueOn} onChange={e=>field("dueOn",e.target.value)}/></label></div>
      }
      <div className="form-group">
        <div className="controlled-classification"><label>{form.direction==="income"?"Origem da receita":"De qual orçamento sai?"}<select required value={form.category} onChange={e=>field("category",e.target.value)}><option value="">Selecione</option>{roots.map(c=><option key={c.id} value={c.name}>{formatBudgetOption(c.name)}</option>)}</select></label><button type="button" className="inline-plus" aria-label={form.direction==="income"?"Criar origem":"Criar orçamento"} onClick={()=>{setQuick("category");setNewName("");setQuickError("");}}><Plus size={20}/></button></div>
        <label>Conta<select required value={form.walletId} onChange={e=>field("walletId",e.target.value)}><option value="">Selecione uma conta</option>{wallets.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      </div>
      {!wallets.length&&<p className="hint">Cadastre uma conta antes de registrar receitas ou contas.</p>}
      {newTitle&&<label className="tick"><input type="checkbox" checked={form.keepOpen} onChange={e=>field("keepOpen",e.target.checked)}/> Salvar e continuar</label>}
    </>}

    {editPlan&&<>
      <p className="hint">Ajustar esta previsão não altera compras já realizadas.</p>
      <div className="field-row major"><ReceiptText/><input aria-label="Descrição da previsão" required value={form.description} maxLength={120} onChange={e=>field("description",e.target.value)}/></div>
      <div className="field-row money-input"><CircleDollarSign/><span>R$</span><MoneyInput ariaLabel="Valor estimado em reais" value={form.amount} onChange={v=>field("amount",v)}/></div>
      <div className="form-grid">
        <label>Mês previsto<input required type="month" value={form.plannedMonth||brDay().slice(0,7)} onChange={e=>setForm(old=>({...old,plannedMonth:e.target.value,plannedFor:""}))}/></label>
        <label>Dia previsto (opcional)<input type="date" value={form.plannedFor||""} onChange={e=>setForm(old=>({...old,plannedFor:e.target.value,plannedMonth:e.target.value?e.target.value.slice(0,7):old.plannedMonth}))}/></label>
      </div>
    </>}

    {drawer==="wallet"&&<>
      <p className="hint">O saldo de abertura representa a posição real da conta na data do cadastro.</p>
      <label>Nome da conta<input required maxLength={90} value={form.name} onChange={e=>field("name",e.target.value)} placeholder="Ex.: Conta principal ou Carteira de Capital"/></label>
      <label>Finalidade da conta<select value={form.walletKind||"checking"} onChange={e=>field("walletKind",e.target.value)}>
        <option value="checking">Conta corrente (uso diário)</option>
        <option value="reserve">Reserva de emergência</option>
        <option value="investment">Carteira de Capital / Investimentos</option>
      </select></label>
      <label>Saldo de abertura (R$)<MoneyInput value={form.balance} allowNegative onChange={v=>field("balance",v)} ariaLabel="Saldo de abertura"/></label>
      <label className="tick"><input type="checkbox" checked={String(form.balance).startsWith("-")} onChange={e=>field("balance",e.target.checked?"-"+(form.balance||"0,00").replace("-",""):(form.balance||"0,00").replace("-",""))}/> Saldo negativo (devedor)</label>
    </>}

    {drawer==="transfer_capital"&&<>
      <p className="hint">Transferir para a Carteira de Capital separa esse valor do dinheiro livre para gastar e soma ao seu patrimônio, sem duplicar despesas.</p>
      <label>Sair da conta<select required value={form.fromWalletId||""} onChange={e=>field("fromWalletId",e.target.value)}>
        <option value="">Selecione a conta de origem</option>
        {(checkingWallets.length?checkingWallets:wallets).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
      </select></label>
      <label>Para a Carteira de Capital / Reserva<select required value={form.toWalletId||""} onChange={e=>field("toWalletId",e.target.value)}>
        <option value="">Selecione a carteira de destino</option>
        {(capitalWallets.length?capitalWallets:wallets).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
      </select></label>
      <label>Valor do aporte (R$)<MoneyInput value={form.amount} onChange={v=>field("amount",v)} ariaLabel="Valor do aporte em reais"/></label>
      <label>Data da transferência<input required type="date" max={brDay()} value={form.transferredOn||brDay()} onChange={e=>field("transferredOn",e.target.value)}/></label>
    </>}

    {drawer==="settle"&&<><p className="hint">Confirmar o valor pago ou recebido. A parte restante permanece pendente.</p><div className="settle-title">{selectedTitleObj?.description}<small>Saldo em aberto: {money(balanceDue)}</small></div><label>Valor efetivado (R$)<MoneyInput value={form.amount} onChange={v=>field("amount",v)} ariaLabel="Valor efetivado em reais"/></label><label>Data da efetivação<input required type="date" max={brDay()} value={form.settledOn} onChange={e=>field("settledOn",e.target.value)}/></label></>}
    {drawer==="budget"&&<>
      <div className="settle-title">{form.category}<small>Competência: {form.budgetMonth}</small></div>
      <label className="tick"><input type="checkbox" checked={form.budgetActive!==false} onChange={e=>field("budgetActive",e.target.checked)}/> Controlar limite mensal neste orçamento</label>
      {form.budgetActive!==false&&<label>Limite mensal (R$)<MoneyInput value={form.amount} onChange={v=>field("amount",v)} ariaLabel="Limite mensal em reais"/></label>}
      {form.budgetActive===false&&<p className="hint">Este orçamento apenas acompanha os gastos, sem trava de limite mensal.</p>}
    </>}
    {(drawer==="asset"||drawer==="liability")&&<><label>Descrição<input required maxLength={120} placeholder={drawer==="asset"?"Ex.: veículo":"Ex.: empréstimo"} value={form.label} onChange={e=>field("label",e.target.value)}/></label><label>Valor atual (R$)<MoneyInput value={form.amount} onChange={v=>field("amount",v)} ariaLabel="Valor atual"/></label><p className="hint">Não inclua novamente o dinheiro já registrado em uma conta.</p></>}
   </form>}
   {quick&&<div className="nested-overlay"><form className="quick-category" onSubmit={createCategory}><div className="quick-head"><h3>{form.direction==="income"?"Nova origem de receita":"Novo orçamento"}</h3><button type="button" aria-label="Fechar" onClick={()=>{setQuick(null);setTrackBudget(false);setQuickLimit("");}}><X size={20}/></button></div><label>Nome<input required maxLength={80} autoFocus value={newName} onChange={e=>setNewName(e.target.value)} placeholder={form.direction==="income"?"Ex.: Freelance":"Ex.: Transporte"}/></label>{form.direction==="expense"&&<><label className="tick"><input type="checkbox" checked={trackBudget} onChange={e=>setTrackBudget(e.target.checked)}/> Controlar limite mensal</label>{trackBudget&&<label>Limite mensal (R$)<MoneyInput value={quickLimit} onChange={setQuickLimit} ariaLabel="Limite mensal em reais"/></label>}</>}{quickError&&<div className="notice error" role="alert">{quickError}</div>}<button type="submit" className="dark-button" disabled={quickBusy}>{quickBusy?"Salvando...":"Adicionar"}</button></form></div>}
 </section></div>;
}
