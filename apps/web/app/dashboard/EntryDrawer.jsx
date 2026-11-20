"use client";
import {useMemo,useState} from "react";
import {X,Plus,CalendarDays,ReceiptText,CircleDollarSign,Repeat2,CheckCircle2,Clock3,ChevronDown,ChevronRight,Sparkles,Check,Compass,ArrowDownCircle,ArrowUpCircle,HandCoins,Search,UserPlus,ArrowLeftRight} from "lucide-react";
import MoneyInput from "./MoneyInput";
import BankIcon from "./BankIcon";
import {BANK_BRANDS} from "../../lib/bank-brands";
import {cents,money,isoDate,brDay} from "../../lib/finance";
import {maskToCents,maskToDecimal} from "../../lib/money-input";
import {isSeries} from "../../lib/cancel-scope";
import {findMatchingSpendingPlans,computePlanRemainingCents} from "../../lib/spending-plans";
import {simulateGoalPurchase} from "../../lib/goal-planner";
import {computeCapitalPace} from "../../lib/capital-pace";
import {computeInvoiceCycleForPurchase} from "../../lib/credit-cards";

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
  selectedMonth="",
  monthlyIncomeCents=0,
  rawData=null,
  spendingPlans=[],
  spendingPlanApplications=[],
  busy,
  error,
  onSave,
  onClose,
  onAction,
  onAddCategory,
  people=[],
  onAddPerson,
  creditCards=[],
  cancellations=[]
}){
 const [quick,setQuick]=useState(null),[budgetPicker,setBudgetPicker]=useState(false),[personPicker,setPersonPicker]=useState(false),[personQuery,setPersonQuery]=useState(""),[newPersonMode,setNewPersonMode]=useState(false),[personMore,setPersonMore]=useState(false),[pName,setPName]=useState(""),[pRel,setPRel]=useState("Amigo"),[pEmail,setPEmail]=useState(""),[pPhone,setPPhone]=useState(""),[pNotes,setPNotes]=useState(""),[pBusy,setPBusy]=useState(false),[pErr,setPErr]=useState(""),[newName,setNewName]=useState(""),[trackBudget,setTrackBudget]=useState(false),[quickLimit,setQuickLimit]=useState(""),[quickError,setQuickError]=useState(""),[quickBusy,setQuickBusy]=useState(false),[showMore,setShowMore]=useState(false);
 const field=(name,value)=>setForm(old=>({...old,[name]:value}));
 const edit=drawer==="edit",newTitle=drawer==="title",editPlan=drawer==="edit_plan",titleEntry=newTitle||edit;
 const intent=newTitle?(form.intent==="transfer"?"transfer":form.intent==="lend"?"lend":"bill"):"bill";
 const selectedPerson=people.find(p=>p.id===form.personId)||null;
 const filteredPeople=useMemo(()=>{
  const q=personQuery.trim().toLowerCase();
  if(!q)return people;
  return people.filter(p=>`${p.name} ${p.relationship||""} ${p.phone||""}`.toLowerCase().includes(q));
 },[people,personQuery]);
 async function createPerson(e){
  e.preventDefault();
  if(!pName.trim()||!onAddPerson)return;
  setPBusy(true);setPErr("");
  try{
    const created=await onAddPerson({name:pName.trim(),relationship:pRel.trim()||"Outro",email:pEmail.trim()||null,phone:pPhone.trim()||null,notes:pNotes.trim()||null});
    if(created?.id){field("personId",created.id);}
    setNewPersonMode(false);setPersonPicker(false);setPName("");setPRel("Amigo");setPEmail("");setPPhone("");setPNotes("");setPersonMore(false);
  }catch(ex){setPErr(ex?.message||"Não foi possível cadastrar a pessoa.");}
  finally{setPBusy(false);}
 }
 const roots=categories.filter(c=>c.direction===form.direction&&c.parent_id===null);
 const activeRoot=roots.find(c=>c.name===form.category);
 const balanceDue=selectedTitleObj?Math.max(0,cents(selectedTitleObj.amount_cents)-cents(selectedTitleObj.settled_cents)):0;
 const amountValue=()=>{try{return maskToCents(form.amount);}catch{return 0;}};

 const formatBudgetMeta=name=>{
  if(form.direction!=="expense")return "";
  const b=budgets.find(x=>x.categoryName===name);
  if(!b||b.limitCents===null)return "Não controla limite";
  const rem=b.remainingLimitCents??b.remainingCents??0;
  return rem<0?`Estourado: ${money(rem)}`:`Restam ${money(rem)}`;
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
    const targetBudgetMonth=selectedMonth||(form.dueOn||form.occurredOn||brDay()).slice(0,7);
    const extra=form.direction==="expense"&&trackBudget?{limit:maskToDecimal(quickLimit),month:targetBudgetMonth}:{};
    await onAddCategory({name:newName.trim(),direction:form.direction,...extra});
    setForm(old=>({...old,category:newName.trim()}));
    setQuick(null);setNewName("");setTrackBudget(false);setQuickLimit("");
  }catch(e){setQuickError(e.message||"Não foi possível cadastrar.");}
  finally{setQuickBusy(false);}
 }

 const formTitle=
  newTitle?(intent==="transfer"?"Nova transferência entre contas":intent==="lend"?"Tenho um empréstimo a fazer":form.direction==="income"?"Tenho uma conta a receber":"Tenho uma conta a pagar"):
  drawer==="edit"?"Editar lançamento":
  drawer==="edit_plan"?"Ajustar previsão de gasto":
  drawer==="wallet"?"Nova conta":
  drawer==="credit_card"?"Novo cartão de crédito":
  drawer==="transfer_capital"?"Aporte para Carteira de Capital":
  drawer==="loan"?"Novo empréstimo / financiamento":
  drawer==="goal_sim"?"Novo planejamento de compra":
  drawer==="capital_goal"?"Nova meta de capital":
  drawer==="settle"?"Confirmar pagamento":
  drawer==="detail"?"Detalhes do lançamento":
  drawer==="budget"?"Configurar orçamento":
  drawer==="asset"?"Novo ativo":"Nova dívida";

 const canSubmit=drawer!=="detail";
 const checkingWallets=wallets.filter(w=>!w.is_reserved&&w.wallet_kind!=="reserve"&&w.wallet_kind!=="investment");
 const capitalWallets=wallets.filter(w=>w.is_reserved||w.wallet_kind==="reserve"||w.wallet_kind==="investment");

 const goalPreview=useMemo(()=>{
  if(drawer!=="goal_sim"||!rawData)return null;
  const safeCents=v=>{try{return maskToCents(v||"0,00");}catch{return 0;}};
  const targetCents=safeCents(form.goalTarget);
  const downPaymentCents=Math.min(targetCents,safeCents(form.goalDownPayment));
  const count=Math.max(1,Math.min(120,Number(form.goalInstallments||1)));
  const interestBps=Math.min(10000,Math.max(0,Math.round(Number(String(form.goalInterestPct||"0").replace(",","."))*100)||0));
  return simulateGoalPurchase(rawData,{title:form.description||"Compra planejada",targetCents,downPaymentCents,installmentCount:count,interestBps,useCapitalInDownPayment:Boolean(form.goalUseCapital),desiredOn:form.goalDesiredOn||brDay()},{today:brDay()});
 },[drawer,rawData,form.description,form.goalTarget,form.goalDownPayment,form.goalInstallments,form.goalInterestPct,form.goalUseCapital,form.goalDesiredOn]);

 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="drawer" role="dialog" aria-modal="true" aria-label={formTitle}>
   <header className="drawer-head"><button type="button" className="plain-icon" onClick={onClose} aria-label="Fechar"><X size={23}/></button><h2>{formTitle}</h2>{canSubmit?<button className="save-pill" form="entry-form" type="submit" disabled={busy}>{busy?"Salvando...":"Salvar"}</button>:<span className="drawer-head-spacer"/>}</header>
   {error&&<div className="notice error" role="alert" style={{margin:"14px 20px"}}>{error}</div>}
   {drawer==="detail"?<div className="detail-layout">
    <div className="detail-amount"><small>{selectedTitleObj?.entry_kind==="transfer"?(selectedTitleObj?.direction==="income"?"Transferência recebida":"Transferência enviada"):selectedTitleObj?.direction==="income"?"A receber":"A pagar"}</small><strong>{money(cents(selectedTitleObj?.amount_cents))}</strong><p>{selectedTitleObj?.description}</p></div>
    <dl className="detail-fields">
      <div><dt>Conta</dt><dd>{wallets.find(w=>w.id===selectedTitleObj?.wallet_id)?.name||"—"}</dd></div>
      {selectedTitleObj?.entry_kind==="transfer"&&<div><dt>{selectedTitleObj?.direction==="expense"?"Conta de destino":"Conta de origem"}</dt><dd>{(()=>{
        const counterpart=rawData?.titles?.find(t=>t.transfer_id&&t.transfer_id===selectedTitleObj?.transfer_id&&t.id!==selectedTitleObj?.id);
        return wallets.find(w=>w.id===counterpart?.wallet_id)?.name||"Outra conta";
      })()}</dd></div>}
      <div><dt>{selectedTitleObj?.entry_kind==="transfer"?"Tipo":selectedTitleObj?.direction==="income"?"Categoria":"Orçamento"}</dt><dd>{selectedTitleObj?.category||"—"}</dd></div>
      <div><dt>Vencimento</dt><dd>{fdate(selectedTitleObj?.due_on)}</dd></div>
      <div><dt>Parcela</dt><dd>{selectedTitleObj?.installment_total>1?selectedTitleObj.installment_index+"/"+selectedTitleObj.installment_total:"Única / fixa"}</dd></div>
      <div><dt>Valor original</dt><dd>{money(cents(selectedTitleObj?.amount_cents))}</dd></div>
      <div><dt>Já efetivado</dt><dd>{money(cents(selectedTitleObj?.settled_cents))}</dd></div>
      <div className="strong"><dt>Saldo pendente</dt><dd>{money(balanceDue)}</dd></div>
    </dl>
    <div className="detail-actions"><button className="dark-button" disabled={balanceDue===0} onClick={()=>onAction("settle",selectedTitleObj.id)}>{selectedTitleObj?.entry_kind==="transfer"?"Confirmar transferência":"Confirmar pagamento"}</button>{selectedTitleObj?.entry_kind!=="transfer"&&<button className="light-button" onClick={()=>onAction("edit",selectedTitleObj.id)}>Editar este lançamento</button>}</div>
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
    {newTitle&&<div className="direction-cards four" role="group" aria-label="Tipo de lançamento">
      <button type="button" className={`direction-card expense${intent==="bill"&&form.direction!=="income"?" active":""}`} aria-pressed={intent==="bill"&&form.direction!=="income"} onClick={()=>setForm(old=>({...old,intent:"bill",direction:"expense",category:old.direction==="expense"?old.category:""}))}>
        <ArrowDownCircle size={20} aria-hidden="true"/>
        <div><strong>A pagar</strong><small>Conta ou gasto</small></div>
      </button>
      <button type="button" className={`direction-card income${intent==="bill"&&form.direction==="income"?" active":""}`} aria-pressed={intent==="bill"&&form.direction==="income"} onClick={()=>setForm(old=>({...old,intent:"bill",direction:"income",category:old.direction==="income"?old.category:""}))}>
        <ArrowUpCircle size={20} aria-hidden="true"/>
        <div><strong>A receber</strong><small>Salário ou entrada</small></div>
      </button>
      <button type="button" className={`direction-card transfer${intent==="transfer"?" active":""}`} aria-pressed={intent==="transfer"} onClick={()=>{
        const fW = form.fromWalletId || form.walletId || wallets[0]?.id || "";
        const tW = form.toWalletId || (wallets.find(w => w.id !== fW)?.id || "");
        setForm(old=>({...old,intent:"transfer",fromWalletId:fW,toWalletId:tW,transferredOn:old.transferredOn||old.dueOn||brDay(),settlementState:old.settlementState||"paid"}));
      }}>
        <ArrowLeftRight size={20} aria-hidden="true"/>
        <div><strong>Transferir</strong><small>Entre contas</small></div>
      </button>
      <button type="button" className={`direction-card lend${intent==="lend"?" active":""}`} aria-pressed={intent==="lend"} onClick={()=>setForm(old=>({...old,intent:"lend",lentOn:old.lentOn||brDay(),expectedRepaymentOn:old.expectedRepaymentOn||old.dueOn||brDay()}))}>
        <HandCoins size={20} aria-hidden="true"/>
        <div><strong>Emprestar</strong><small>Para alguém</small></div>
      </button>
    </div>}

    {/* TRANSFERÊNCIA ENTRE CONTAS */}
    {newTitle&&intent==="transfer"&&<>
      {wallets.length < 2 ? (
        <div className="notice warning" style={{margin:"0 0 16px"}}>
          <strong>Você precisa de pelo menos 2 contas para transferir.</strong>
          <p style={{margin:"6px 0 0"}}>Cadastre outra conta bancária ou carteira em Criar › Nova conta para movimentar saldos entre elas.</p>
        </div>
      ) : (
        <>
          <div className="field-row major">
            <ReceiptText/>
            <input aria-label="Identificação da transferência (opcional)" placeholder="Ex.: Pix para PagBank, Reserva (opcional)" value={form.description||""} maxLength={120} onChange={e=>field("description",e.target.value)}/>
          </div>
          <div className="field-row money-input">
            <CircleDollarSign/>
            <span>R$</span>
            <MoneyInput ariaLabel="Valor a transferir em reais" value={form.amount} onChange={v=>field("amount",v)}/>
          </div>
          <div className="transfer-routing-card">
            <div className="transfer-route-item">
              <span className="field-caption">De qual conta sai (Origem)</span>
              <select
                required
                value={form.fromWalletId||""}
                onChange={e=>{
                  const newFrom = e.target.value;
                  field("fromWalletId", newFrom);
                  if (newFrom && form.toWalletId === newFrom) {
                    const alt = wallets.find(w => w.id !== newFrom);
                    if (alt) field("toWalletId", alt.id);
                  }
                }}
              >
                <option value="">Selecione a conta de origem</option>
                {wallets.map(w=>(
                  <option key={w.id} value={w.id}>{w.name} {w.is_reserved ? "(Reserva / Capital)" : ""}</option>
                ))}
              </select>
            </div>
            <div className="transfer-swap-btn-container">
              <button
                type="button"
                className="transfer-swap-btn"
                title="Inverter contas"
                aria-label="Inverter conta de origem e conta de destino"
                onClick={()=>{
                  const curFrom = form.fromWalletId;
                  const curTo = form.toWalletId;
                  setForm(old=>({...old,fromWalletId:curTo,toWalletId:curFrom}));
                }}
              >
                <ArrowLeftRight size={16} aria-hidden="true"/>
              </button>
            </div>
            <div className="transfer-route-item">
              <span className="field-caption">Para qual conta vai (Destino)</span>
              <select
                required
                value={form.toWalletId||""}
                onChange={e=>field("toWalletId",e.target.value)}
              >
                <option value="">Selecione a conta de destino</option>
                {wallets.map(w=>(
                  <option key={w.id} value={w.id} disabled={w.id === form.fromWalletId}>
                    {w.name} {w.is_reserved ? "(Reserva / Capital)" : ""} {w.id === form.fromWalletId ? "(Mesma conta)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-grid">
            <label>Data da transferência
              <input
                required
                type="date"
                value={form.transferredOn||form.dueOn||brDay()}
                onChange={e=>{
                  const d = e.target.value;
                  field("transferredOn", d);
                  if (d > brDay()) field("settlementState", "pending");
                }}
              />
            </label>
            <div className="transfer-status-field">
              <span className="field-caption">Situação</span>
              <select
                value={form.settlementState||"paid"}
                onChange={e=>field("settlementState", e.target.value)}
              >
                <option value="paid">Já realizada (debitar e creditar agora)</option>
                <option value="pending">Agendada / Prevista</option>
              </select>
            </div>
          </div>
          <div className="transfer-guideline-note">
            <p><strong>Sem impacto nos limites ou salário:</strong> Esta operação transfere o saldo entre suas contas cadastradas sem duplicar receitas nem despesas de consumo.</p>
          </div>
        </>
      )}
    </>}

    {/* EMPRESTAR DINHEIRO */}
    {newTitle&&intent==="lend"&&<>
      <div className="field-row major"><ReceiptText/><input aria-label="Descrição do empréstimo" placeholder="Ex.: Ajuda conserto carro, Empréstimo" required value={form.description} maxLength={140} onChange={e=>field("description",e.target.value)}/></div>
      <div className="field-row money-input"><CircleDollarSign/><span>R$</span><MoneyInput ariaLabel="Valor emprestado em reais" value={form.amount} onChange={v=>field("amount",v)}/></div>
      <div className="form-group">
        <label>De qual conta saiu<select required value={form.walletId} onChange={e=>field("walletId",e.target.value)}><option value="">Selecione a conta</option>{wallets.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <div className="controlled-classification">
          <div className="budget-picker-field">
            <span className="field-caption">Para quem</span>
            <input className="sr-only-input" tabIndex={-1} aria-hidden="true" required value={form.personId||""} onChange={()=>{}}/>
            <button type="button" className="budget-picker-trigger" onClick={()=>{setNewPersonMode(false);setPersonQuery("");setPersonPicker(true);}}>
              <span>{selectedPerson?selectedPerson.name:"Buscar ou cadastrar pessoa"}</span>
              <small>{selectedPerson?selectedPerson.relationship:"Escolher da carteira de pessoas ›"}</small>
            </button>
          </div>
          <button type="button" className="inline-plus" aria-label="Pesquisar ou cadastrar pessoa" onClick={()=>{setNewPersonMode(false);setPersonQuery("");setPersonPicker(true);}}><Search size={18}/></button>
        </div>
        <div className="form-grid">
          <label>Data de saída<input required type="date" max={brDay()} value={form.lentOn||brDay()} onChange={e=>field("lentOn",e.target.value)}/></label>
          <label>Previsão de pagamento<input required type="date" min={form.lentOn||brDay()} value={form.expectedRepaymentOn||brDay()} onChange={e=>field("expectedRepaymentOn",e.target.value)}/></label>
        </div>
        <p className="hint" style={{margin:0}}>O valor sai da sua conta hoje e cria um recebível previsto na carteira dessa pessoa (aceita devoluções parciais e acompanha a cobrança se virar o mês).</p>
      </div>
    </>}

    {/* CONTA A PAGAR / A RECEBER (unificado) ou edição */}
    {titleEntry&&(!newTitle||intent==="bill")&&<>
      <div className="field-row major"><ReceiptText/><input aria-label="Descrição do lançamento" placeholder={form.direction==="income"?"Ex.: Salário, Reembolso":"Ex.: Mercado, Aluguel, Energia"} required value={form.description} maxLength={120} onChange={e=>field("description",e.target.value)}/></div>
      <div className="field-row money-input"><CircleDollarSign/><span>R$</span><MoneyInput ariaLabel="Valor em reais" value={form.amount} onChange={v=>field("amount",v)}/></div>
      {edit?<div className="editing-scope-note">A alteração será aplicada <strong>somente a este lançamento</strong>. Outras parcelas permanecem como estão.</div>:
      <><div className="field-row"><Repeat2/><label><small>Repetição</small><select value={form.mode} onChange={e=>field("mode",e.target.value)}><option value="single">Conta única</option><option value="monthly">Repete todo mês</option><option value="installments">Parcelada</option></select></label></div>
      {form.mode==="installments"&&<div className="repeat-config"><div className="section-header"><h3>Configurar parcelas</h3><span>Mensais</span></div>
      <div className="form-grid"><label>Começar na parcela<input type="number" min="1" max={form.count} value={form.startIndex} onChange={e=>field("startIndex",e.target.value)}/></label><label>Total de parcelas<input type="number" min="2" max="60" value={form.count} onChange={e=>field("count",e.target.value)}/></label></div>
      <label>O valor informado representa<select value={form.valueMode} onChange={e=>field("valueMode",e.target.value)}><option value="total">Valor total da operação</option><option value="installment">Valor de cada parcela</option></select></label>
      <div className="repeat-preview"><strong>{Math.max(0,Number(form.count)-Number(form.startIndex)+1)||0} parcelas futuras</strong><span>{form.valueMode==="installment"?"Valor mensal: "+money(amountValue()):"Valor total: "+money(amountValue())}</span></div></div>}
      {form.mode==="monthly"&&<div className="repeat-config"><strong>Conta recorrente</strong><p>As próximas ocorrências são projetadas automaticamente sem precisar recadastrar.</p><label>Encerrar em (opcional)<input type="date" min={form.dueOn} max="2099-12-31" value={form.endsOn||""} onChange={ev=>field("endsOn",ev.target.value)}/></label></div>}
      </>}
      {newTitle&&form.mode==="single"&&form.direction!=="income"&&!form.creditCardId&&<div className="direction-cards compact" role="group" aria-label="Situação da conta">
        <button type="button" className={`direction-card neutral${form.settlementState!=="paid"?" active":""}`} aria-pressed={form.settlementState!=="paid"} onClick={()=>field("settlementState","pending")}>
          <Clock3 size={18} aria-hidden="true"/>
          <div><strong>A pagar</strong></div>
        </button>
        <button type="button" className={`direction-card expense${form.settlementState==="paid"?" active":""}`} aria-pressed={form.settlementState==="paid"} onClick={()=>field("settlementState","paid")}>
          <CheckCircle2 size={18} aria-hidden="true"/>
          <div><strong>Já paguei</strong></div>
        </button>
      </div>}
      {newTitle&&form.direction==="income"&&form.mode==="single"&&<div className="direction-cards compact" role="group" aria-label="Situação da receita">
        <button type="button" className={`direction-card neutral${form.settlementState!=="paid"?" active":""}`} aria-pressed={form.settlementState!=="paid"} onClick={()=>field("settlementState","pending")}>
          <Clock3 size={18} aria-hidden="true"/>
          <div><strong>A receber</strong></div>
        </button>
        <button type="button" className={`direction-card income${form.settlementState==="paid"?" active":""}`} aria-pressed={form.settlementState==="paid"} onClick={()=>field("settlementState","paid")}>
          <CheckCircle2 size={18} aria-hidden="true"/>
          <div><strong>Já recebido</strong></div>
        </button>
      </div>}
      {newTitle&&form.direction!=="income"&&form.creditCardId?(()=>{
        const card=creditCards.find(c=>c.id===form.creditCardId);
        const pDate=form.occurredOn||brDay();
        const cyc=card?computeInvoiceCycleForPurchase({purchaseDate:pDate,closingDay:card.closing_day,dueDay:card.due_day}):null;
        return <>
          <div className="field-row"><CalendarDays/><label><small>Data da compra</small><input required type="date" value={pDate} onChange={e=>setForm(old=>({...old,occurredOn:e.target.value,dueOn:e.target.value}))}/></label></div>
          {cyc&&<div className="repeat-config" style={{padding:"10px 12px"}}><strong style={{fontSize:13}}>Fatura prevista: {cyc.invoiceMonth}</strong><p style={{margin:0}}>Vencimento em <strong>{fdate(cyc.dueDate)}</strong> (fecha dia {card.closing_day}). O valor compromete o limite do cartão e o saldo previsto na fatura.</p></div>}
        </>;
      })():newTitle&&form.mode==="single"&&form.settlementState==="paid"?
        <div className="field-row"><CalendarDays/><label><small>{form.direction==="income"?"Data do recebimento":"Data do pagamento"}</small><input required type="date" max={brDay()} value={form.settledOn||brDay()} onChange={e=>field("settledOn",e.target.value)}/></label></div>:
        <div className="field-row"><CalendarDays/><label><small>Data de vencimento</small><input required type="date" value={form.dueOn} onChange={e=>field("dueOn",e.target.value)}/></label></div>
      }
      <div className="form-group">
        {form.direction==="income"?(
          <div className="controlled-classification"><label>Origem da receita<select required value={form.category} onChange={e=>field("category",e.target.value)}><option value="">Selecione</option>{roots.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select></label><button type="button" className="inline-plus" aria-label="Criar origem" onClick={()=>{setQuick("category");setNewName("");setQuickError("");}}><Plus size={20}/></button></div>
        ):(
          <div className="controlled-classification">
            <div className="budget-picker-field">
              <span className="field-caption">De qual orçamento sai?</span>
              <input className="sr-only-input" tabIndex={-1} aria-hidden="true" required value={form.category} onChange={()=>{}}/>
              <button type="button" className="budget-picker-trigger" onClick={()=>setBudgetPicker(true)}>
                <span>{form.category||"Selecione o orçamento"}</span>
                <small>{form.category?formatBudgetMeta(form.category):"Escolher da lista ›"}</small>
              </button>
            </div>
            <button type="button" className="inline-plus" aria-label="Criar orçamento" onClick={()=>{setQuick("category");setNewName("");setQuickError("");}}><Plus size={20}/></button>
          </div>
        )}
        {newTitle&&form.direction!=="income"&&creditCards.length>0?(
          <label>Conta ou cartão de crédito
            <select required value={form.creditCardId?`card:${form.creditCardId}`:form.walletId} onChange={e=>{
              const v=e.target.value;
              if(v.startsWith("card:")){
                const cid=v.slice(5);
                const c=creditCards.find(x=>x.id===cid);
                setForm(old=>({...old,creditCardId:cid,walletId:c?.default_wallet_id||old.walletId||wallets[0]?.id||"",settlementState:"pending",occurredOn:old.occurredOn||brDay()}));
              }else{
                setForm(old=>({...old,creditCardId:"",walletId:v}));
              }
            }}>
              <option value="">Selecione a conta ou cartão</option>
              <optgroup label="Contas bancárias">
                {wallets.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
              </optgroup>
              <optgroup label="Cartões de crédito">
                {creditCards.map(c=><option key={c.id} value={`card:${c.id}`}>💳 {c.name} (vence dia {c.due_day})</option>)}
              </optgroup>
            </select>
          </label>
        ):(
          <label>Conta<select required value={form.walletId} onChange={e=>field("walletId",e.target.value)}><option value="">Selecione uma conta</option>{wallets.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        )}
      </div>
      {!wallets.length&&<p className="hint">Cadastre uma conta antes de registrar receitas ou contas.</p>}
      {newTitle&&<label className="kc-check"><input type="checkbox" checked={form.keepOpen} onChange={e=>field("keepOpen",e.target.checked)}/><span className="kc-check-box" aria-hidden="true"><Check size={12} strokeWidth={3}/></span><span>Salvar e continuar</span></label>}
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
      <div className="bank-picker-preview">
        <BankIcon name={form.name} size={40}/>
        <label style={{flex:1}}>Nome da conta<input required maxLength={90} value={form.name} onChange={e=>field("name",e.target.value)} placeholder="Ex.: Nubank, Itaú, Sicredi ou Maré"/></label>
      </div>
      <div className="bank-picker-row" aria-label="Atalhos de bancos">
        {["nubank","itau","bradesco","bb","caixa","santander","inter","c6","picpay","mercado_pago","pagbank","neon","maree","sicredi","sicoob"].map(bid=>{
          const b=BANK_BRANDS.find(x=>x.id===bid);
          if(!b)return null;
          return <button key={b.id} type="button" className="bank-pick-chip" onClick={()=>field("name",b.name)} title={b.name}><BankIcon name={b.name} size={22}/><span>{b.name}</span></button>;
        })}
      </div>
      <label>Finalidade da conta<select value={form.walletKind||"checking"} onChange={e=>field("walletKind",e.target.value)}>
        <option value="checking">Conta corrente (uso diário)</option>
        <option value="reserve">Reserva de emergência</option>
        <option value="investment">Carteira de Capital / Investimentos</option>
      </select></label>
      <label>Saldo de abertura (R$)<MoneyInput value={form.balance} allowNegative onChange={v=>field("balance",v)} ariaLabel="Saldo de abertura"/></label>
      <label className="kc-check"><input type="checkbox" checked={String(form.balance).startsWith("-")} onChange={e=>field("balance",e.target.checked?"-"+(form.balance||"0,00").replace("-",""):(form.balance||"0,00").replace("-",""))}/><span className="kc-check-box" aria-hidden="true"><Check size={12} strokeWidth={3}/></span><span>Saldo negativo (devedor)</span></label>
    </>}

    {drawer==="credit_card"&&<>
      <p className="hint">Cadastre seu cartão para acompanhar limite disponível, fechamento da fatura e impacto no saldo previsto sem dupla contagem.</p>
      <div className="bank-picker-preview">
        <BankIcon name={form.name} size={40}/>
        <label style={{flex:1}}>Nome do cartão<input required maxLength={90} value={form.name} onChange={e=>field("name",e.target.value)} placeholder="Ex.: Nubank, Itaú Black, Inter"/></label>
      </div>
      <div className="bank-picker-row" aria-label="Atalhos de bancos">
        {["nubank","itau","bradesco","bb","caixa","santander","inter","c6","picpay","mercado_pago","pagbank","neon","maree","sicredi","sicoob"].map(bid=>{
          const b=BANK_BRANDS.find(x=>x.id===bid);
          if(!b)return null;
          return <button key={b.id} type="button" className="bank-pick-chip" onClick={()=>field("name",b.name)} title={b.name}><BankIcon name={b.name} size={22}/><span>{b.name}</span></button>;
        })}
      </div>
      <label>Limite total (R$)<MoneyInput value={form.cardLimit||"0,00"} onChange={v=>field("cardLimit",v)} ariaLabel="Limite do cartão em reais"/></label>
      <div className="form-grid">
        <label>Dia de fechamento<input required type="number" min="1" max="31" value={form.closingDay||"5"} onChange={e=>field("closingDay",e.target.value)}/></label>
        <label>Dia de vencimento<input required type="number" min="1" max="31" value={form.dueDay||"10"} onChange={e=>field("dueDay",e.target.value)}/></label>
      </div>
      <label>Conta padrão para pagar a fatura
        <select value={form.walletId||""} onChange={e=>field("walletId",e.target.value)}>
          <option value="">Escolher na hora de pagar</option>
          {wallets.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
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
      <label className="kc-check"><input type="checkbox" checked={form.budgetActive!==false} onChange={e=>field("budgetActive",e.target.checked)}/><span className="kc-check-box" aria-hidden="true"><Check size={12} strokeWidth={3}/></span><span>Controlar limite mensal neste orçamento</span></label>
      {form.budgetActive!==false&&<label>Limite mensal (R$)<MoneyInput value={form.amount} onChange={v=>field("amount",v)} ariaLabel="Limite mensal em reais"/></label>}
      {form.budgetActive===false&&<p className="hint">Este orçamento apenas acompanha os gastos, sem trava de limite mensal.</p>}
    </>}
    {(drawer==="asset"||drawer==="liability")&&<><label>Descrição<input required maxLength={120} placeholder={drawer==="asset"?"Ex.: veículo":"Ex.: empréstimo"} value={form.label} onChange={e=>field("label",e.target.value)}/></label><label>Valor atual (R$)<MoneyInput value={form.amount} onChange={v=>field("amount",v)} ariaLabel="Valor atual"/></label><p className="hint">Não inclua novamente o dinheiro já registrado em uma conta.</p></>}

    {drawer==="loan"&&<>
      <p className="hint">O valor recebido entra na conta sem contar como salário, e as parcelas somam no endividamento total até a última parcela.</p>
      <label>Descrição do empréstimo / financiamento<input required maxLength={120} placeholder="Ex.: Empréstimo Banco X" value={form.description} onChange={e=>field("description",e.target.value)}/></label>
      <div className="form-grid">
        <label>Valor recebido (R$)<MoneyInput value={form.loanPrincipal||"0,00"} onChange={v=>field("loanPrincipal",v)} ariaLabel="Valor recebido"/></label>
        <label>Data do recebimento<input required type="date" max={brDay()} value={form.loanReceivedOn||brDay()} onChange={e=>field("loanReceivedOn",e.target.value)}/></label>
      </div>
      <label className="kc-check"><input type="checkbox" checked={form.loanCreditWallet!==false} onChange={e=>field("loanCreditWallet",e.target.checked)}/><span className="kc-check-box" aria-hidden="true"><Check size={12} strokeWidth={3}/></span><span>Creditar o valor recebido na conta selecionada</span></label>
      <label>Conta vinculada<select required value={form.walletId} onChange={e=>field("walletId",e.target.value)}><option value="">Selecione uma conta</option>{(checkingWallets.length?checkingWallets:wallets).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      <div className="form-grid">
        <label>Total de parcelas<input required type="number" min="2" max="120" value={form.loanCount||"12"} onChange={e=>field("loanCount",e.target.value)}/></label>
        <label>Valor da parcela (R$)<MoneyInput value={form.amount} onChange={v=>field("amount",v)} ariaLabel="Valor da parcela"/></label>
      </div>
      <label>Vencimento da 1ª parcela<input required type="date" value={form.dueOn} onChange={e=>field("dueOn",e.target.value)}/></label>
      {(()=>{
        const safeC=v=>{try{return maskToCents(v||"0,00");}catch{return 0;}};
        const p=safeC(form.loanPrincipal);const inst=safeC(form.amount);const cnt=Math.max(2,Number(form.loanCount||12));
        const total=inst*cnt;const interest=Math.max(0,total-p);
        return inst>0?<div className="repeat-config"><div className="repeat-preview" style={{borderTop:0,paddingTop:0}}><strong>Total a pagar: {money(total)} ({cnt}x de {money(inst)})</strong><span>Custo financeiro / juros totais: {money(interest)}</span></div></div>:null;
      })()}
    </>}

    {drawer==="goal_sim"&&<>
      <p className="hint">Simule uma compra, viagem ou bem antes de assumir o compromisso. Não gera cobrança nem altera o saldo previsto.</p>
      <label>O que deseja planejar?<input required maxLength={120} placeholder="Ex.: Notebook, Viagem, Geladeira" value={form.description} onChange={e=>field("description",e.target.value)}/></label>
      <div className="form-grid">
        <label>Valor total (R$)<MoneyInput value={form.goalTarget||"0,00"} onChange={v=>field("goalTarget",v)} ariaLabel="Valor total desejado"/></label>
        <label>Entrada (R$)<MoneyInput value={form.goalDownPayment||"0,00"} onChange={v=>field("goalDownPayment",v)} ariaLabel="Valor de entrada"/></label>
      </div>
      <div className="form-grid">
        <label>Parcelas<input required type="number" min="1" max="120" value={form.goalInstallments||"1"} onChange={e=>field("goalInstallments",e.target.value)}/></label>
        <label>Juros (% a.m. · opcional)<input type="text" inputMode="decimal" placeholder="Ex.: 1,80" value={form.goalInterestPct||""} onChange={e=>field("goalInterestPct",e.target.value)}/></label>
      </div>
      <label>Data desejada<input required type="date" min={brDay()} value={form.goalDesiredOn||brDay()} onChange={e=>field("goalDesiredOn",e.target.value)}/></label>
      <label className="kc-check"><input type="checkbox" checked={Boolean(form.goalUseCapital)} onChange={e=>field("goalUseCapital",e.target.checked)}/><span className="kc-check-box" aria-hidden="true"><Check size={12} strokeWidth={3}/></span><span>Usar saldo da Carteira de Capital / Reserva na entrada</span></label>
      {goalPreview&&<>
        <div className={`goal-verdict ${goalPreview.isFeasible?"ok":"warn"}`}>
          <Compass size={18}/>
          <div>
            <strong>{goalPreview.isFeasible?`Cabe no plano na data desejada (${fdate(form.goalDesiredOn||brDay())})`:goalPreview.firstFeasibleDate?`Melhor momento: a partir de ${fdate(goalPreview.firstFeasibleDate)}`:"Ainda não cabe no horizonte"}</strong>
            <small>
              {goalPreview.perInstallmentCents>0&&`${goalPreview.installmentCountVerified}x de ${money(goalPreview.perInstallmentCents)}`}
              {goalPreview.totalInterestCents>0&&` · Juros totais: ${money(goalPreview.totalInterestCents)}`}
            </small>
          </div>
        </div>
        {goalPreview.twoStepVerdict&&<div className="repeat-config">
          <div className="repeat-preview" style={{borderTop:0,paddingTop:0}}>
            <span><strong>1. Entrada ({money(goalPreview.twoStepVerdict.downPaymentCents)}):</strong> {goalPreview.twoStepVerdict.hasDownPaymentNow?"Você já tem disponível hoje":goalPreview.twoStepVerdict.downPaymentReadyDate?`Atinge em ${fdate(goalPreview.twoStepVerdict.downPaymentReadyDate)}`:"Não atinge no horizonte"}</span>
            <span><strong>2. Parcela ({money(goalPreview.twoStepVerdict.perInstallmentCents)}/mês):</strong> {goalPreview.twoStepVerdict.installmentFitsMonthly?`Cabe na sobra mensal (${money(goalPreview.twoStepVerdict.monthlyFreeSurplusCents)}/mês)`:`Não cabe na sobra mensal (${money(goalPreview.twoStepVerdict.monthlyFreeSurplusCents)}/mês · faltam ${money(goalPreview.twoStepVerdict.monthlyGapCents)}/mês)`}</span>
          </div>
        </div>}
      </>}
    </>}

    {drawer==="capital_goal"&&<>
      <p className="hint">Defina quanto de capital ou reserva quer acumular até uma data para acompanhar se está no ritmo certo.</p>
      <label>Nome da meta<input required maxLength={120} placeholder="Ex.: Reserva de emergência, Capital de giro" value={form.description} onChange={e=>field("description",e.target.value)}/></label>
      <div className="form-grid">
        <label>Quanto quero ter (R$)<MoneyInput value={form.goalTarget||"0,00"} onChange={v=>field("goalTarget",v)} ariaLabel="Valor da meta de capital"/></label>
        <label>Até qual data<input required type="date" min={brDay()} value={form.goalDesiredOn||brDay()} onChange={e=>field("goalDesiredOn",e.target.value)}/></label>
      </div>
      {(()=>{
        const safeC=v=>{try{return maskToCents(v||"0,00");}catch{return 0;}};
        const pace=computeCapitalPace({targetCents:safeC(form.goalTarget),targetDate:form.goalDesiredOn||brDay(),currentCapitalCents:Number(form.currentCapitalCents||0),monthlyContributionCents:Number(form.monthlyCapitalContributionCents||0),today:brDay()});
        return pace.targetCents>0?<div className={`goal-verdict ${pace.onPace?"ok":"warn"}`}>
          <Compass size={18}/>
          <div>
            <strong>{pace.onPace?"No ritmo com seu aporte atual":`Aporte necessário: ${money(pace.requiredMonthlyCents)}/mês`}</strong>
            <small>{pace.onPace?`Em ${pace.monthsLeft} mês(es), seu ritmo atual de ${money(pace.monthlyContributionCents)}/mês atinge a meta.`:`Faltam ${money(pace.remainingCents)} em ${pace.monthsLeft} mês(es). Aumente ${money(pace.monthlyGapCents)}/mês no orçamento de Capital.`}</small>
          </div>
        </div>:null;
      })()}
    </>}
   </form>}
 </section>
 {budgetPicker&&<div className="nested-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setBudgetPicker(false);}}>
   <div className="quick-category budget-picker-dialog" role="dialog" aria-modal="true" aria-label="Selecionar orçamento">
     <div className="quick-head">
       <h3>Selecionar orçamento</h3>
       <button type="button" aria-label="Fechar" onClick={()=>setBudgetPicker(false)}><X size={20}/></button>
     </div>
     <div className="action-menu">
       {roots.map(c=>{
         const meta=formatBudgetMeta(c.name);
         const isOver=meta.startsWith("Estourado");
         return <button type="button" key={c.id} className={form.category===c.name?"selected":""} onClick={()=>{setForm(old=>({...old,category:c.name,spendingPlanId:""}));setBudgetPicker(false);}}>
           <span>{c.name}<small className={isOver?"red":""}>{meta}</small></span>
           <span>{form.category===c.name?<Check size={16}/>:"›"}</span>
         </button>;
       })}
     </div>
     <button type="button" className="light-button" onClick={()=>{setBudgetPicker(false);setQuick("category");setNewName("");setQuickError("");}}>
       <Plus size={16}/> Novo orçamento
     </button>
   </div>
 </div>}
 {personPicker&&<div className="nested-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setPersonPicker(false);}}>
   <div className="quick-category budget-picker-dialog" role="dialog" aria-modal="true" aria-label="Selecionar ou cadastrar pessoa">
     <div className="quick-head">
       <h3>{newPersonMode?"Nova pessoa":"Selecionar pessoa"}</h3>
       <button type="button" aria-label="Fechar" onClick={()=>setPersonPicker(false)}><X size={20}/></button>
     </div>
     {!newPersonMode?<>
       <div className="field-row" style={{padding:"6px 10px"}}><Search size={16}/><input aria-label="Buscar pessoa" placeholder="Buscar por nome ou relação..." value={personQuery} onChange={e=>setPersonQuery(e.target.value)}/></div>
       <div className="action-menu">
         {filteredPeople.length?filteredPeople.map(p=>(
           <button type="button" key={p.id} className={form.personId===p.id?"selected":""} onClick={()=>{field("personId",p.id);setPersonPicker(false);}}>
             <span>{p.name}<small>{p.relationship||"Outro"}{p.phone?` · ${p.phone}`:""}</small></span>
             <span>{form.personId===p.id?<Check size={16}/>:"›"}</span>
           </button>
         )):<p className="hint" style={{margin:"8px 0"}}>Nenhuma pessoa encontrada.</p>}
       </div>
       <button type="button" className="pill pill-primary pill-compact" style={{width:"100%",justifyContent:"center"}} onClick={()=>{setNewPersonMode(true);setPName(personQuery);setPErr("");}}>
         <UserPlus size={16}/> Nova pessoa
       </button>
     </>:<form onSubmit={createPerson} style={{display:"grid",gap:12}}>
       <label>Nome<input required maxLength={120} autoFocus value={pName} onChange={e=>setPName(e.target.value)} placeholder="Ex.: João Silva"/></label>
       <label>Relação<select value={pRel} onChange={e=>setPRel(e.target.value)}>
         {["Amigo","Primo","Tio","Irmão","Pai/Mãe","Colega","Cliente","Outro"].map(r=><option key={r} value={r}>{r}</option>)}
       </select></label>
       <button type="button" className="text-button" onClick={()=>setPersonMore(v=>!v)}>
         {personMore?<ChevronDown size={15}/>:<ChevronRight size={15}/>} Mais (e-mail, telefone, observações)
       </button>
       {personMore&&<div style={{display:"grid",gap:10}}>
         <label>E-mail (opcional)<input type="email" maxLength={160} value={pEmail} onChange={e=>setPEmail(e.target.value)} placeholder="nome@email.com"/></label>
         <label>Telefone / WhatsApp (opcional)<input maxLength={40} value={pPhone} onChange={e=>setPPhone(e.target.value)} placeholder="(11) 99999-9999"/></label>
         <label>Observações / Chave Pix (opcional)<input maxLength={300} value={pNotes} onChange={e=>setPNotes(e.target.value)} placeholder="Ex.: Pix CPF ou combinado"/></label>
       </div>}
       {pErr&&<div className="notice error" role="alert">{pErr}</div>}
       <div style={{display:"flex",gap:8}}>
         <button type="button" className="light-button" onClick={()=>setNewPersonMode(false)}>Voltar</button>
         <button type="submit" className="dark-button" disabled={pBusy}>{pBusy?"Salvando...":"Cadastrar pessoa"}</button>
       </div>
     </form>}
   </div>
 </div>}
 {quick&&<div className="nested-overlay" onMouseDown={e=>{if(e.target===e.currentTarget){setQuick(null);setTrackBudget(false);setQuickLimit("");}}}><form className="quick-category" onSubmit={createCategory}><div className="quick-head"><h3>{form.direction==="income"?"Nova origem de receita":"Novo orçamento"}</h3><button type="button" aria-label="Fechar" onClick={()=>{setQuick(null);setTrackBudget(false);setQuickLimit("");}}><X size={20}/></button></div><label>Nome<input required maxLength={80} autoFocus value={newName} onChange={e=>setNewName(e.target.value)} placeholder={form.direction==="income"?"Ex.: Freelance":"Ex.: Transporte"}/></label>{form.direction==="expense"&&<><label className="kc-check"><input type="checkbox" checked={trackBudget} onChange={e=>setTrackBudget(e.target.checked)}/><span className="kc-check-box" aria-hidden="true"><Check size={12} strokeWidth={3}/></span><span>Controlar limite mensal</span></label>{trackBudget&&<><label>Limite mensal (R$)<MoneyInput value={quickLimit} onChange={setQuickLimit} ariaLabel="Limite mensal em reais"/></label><p className="hint" style={{margin:"-4px 0 0"}}>Se a soma dos limites passar da renda de {selectedMonth||brDay().slice(0,7)}, os demais limites variáveis são recalculados automaticamente (preservando Reserva e Capital).</p></>}</>}{quickError&&<div className="notice error" role="alert">{quickError}</div>}<button type="submit" className="dark-button" disabled={quickBusy}>{quickBusy?"Salvando...":"Adicionar"}</button></form></div>}
 </div>;
}
