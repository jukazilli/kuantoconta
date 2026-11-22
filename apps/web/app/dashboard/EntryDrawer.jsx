"use client";
import {useMemo,useState} from "react";
import {X,Plus,CalendarDays,ReceiptText,CircleDollarSign,Repeat2,CheckCircle2,Clock3,ChevronDown,ChevronRight,Check,ArrowDownCircle,ArrowUpCircle,HandCoins,Search,UserPlus,ArrowLeftRight,PiggyBank,AlignLeft,MoreHorizontal,CreditCard,Tag,Utensils,Home,Car,HeartPulse,Gamepad2,GraduationCap,Briefcase} from "lucide-react";
import MoneyInput from "./MoneyInput";
import BankIcon from "./BankIcon";
import PlanningWizard from "./PlanningWizard";
import {getCategoryVisual} from "./MobileWorkspace";
import {BANK_BRANDS} from "../../lib/bank-brands";
import {cents,money,isoDate,brDay} from "../../lib/finance";
import {maskToCents,maskToDecimal} from "../../lib/money-input";
import {isSeries} from "../../lib/cancel-scope";
import {findMatchingSpendingPlans,computePlanRemainingCents} from "../../lib/spending-plans";
import {computeCapitalPace} from "../../lib/capital-pace";
import {computeInvoiceCycleForPurchase,computeCardUsage} from "../../lib/credit-cards";

const fdate=d=>{const s=isoDate(d).split("-");return s.length===3?`${s[2]}/${s[1]}/${s[0]}`:"—";};

function CategoryCircleIcon({name,direction="expense"}){
 const vis=getCategoryVisual(name,direction);
 const Icon=
  /alimenta|mercado|refei/i.test(name)?Utensils:
  /moradia|aluguel|casa/i.test(name)?Home:
  /transporte|carro|uber/i.test(name)?Car:
  /sa[uú]de|farm/i.test(name)?HeartPulse:
  /lazer|viagem/i.test(name)?Gamepad2:
  /educa|faculdade|curso/i.test(name)?GraduationCap:
  /sal[aá]rio|renda|benef/i.test(name)?Briefcase:
  Tag;
 return <span className="kc-mob-cat-circle" style={{background:vis.bg,color:vis.fg}} aria-hidden="true"><Icon size={17}/></span>;
}

export default function EntryDrawer({
  drawer,
  form,
  setForm,
  selectedTitleObj,
  settlements=[],
  wallets=[],
  walletBalances={},
  caixinhas=[],
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
  safeContribution=null,
  cancellations=[],
  isMobilePhone=false
}){
 const [quick,setQuick]=useState(null),[budgetPicker,setBudgetPicker]=useState(false),[personPicker,setPersonPicker]=useState(false),[personQuery,setPersonQuery]=useState(""),[newPersonMode,setNewPersonMode]=useState(false),[personMore,setPersonMore]=useState(false),[pName,setPName]=useState(""),[pRel,setPRel]=useState("Amigo"),[pEmail,setPEmail]=useState(""),[pPhone,setPPhone]=useState(""),[pNotes,setPNotes]=useState(""),[pBusy,setPBusy]=useState(false),[pErr,setPErr]=useState(""),[newName,setNewName]=useState(""),[trackBudget,setTrackBudget]=useState(false),[quickLimit,setQuickLimit]=useState(""),[quickError,setQuickError]=useState(""),[quickBusy,setQuickBusy]=useState(false),[showMore,setShowMore]=useState(false),[mobTypeSwitcherOpen,setMobTypeSwitcherOpen]=useState(false);
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
  newTitle?(intent==="transfer"?"Transferência entre contas":intent==="lend"?"Emprestar dinheiro":form.direction==="income"?"Conta a receber":"Conta a pagar"):
  drawer==="edit"?"Editar lançamento":
  drawer==="edit_plan"?"Ajustar previsão de gasto":
  drawer==="wallet"?"Conta bancária":
  drawer==="credit_card"?"Cartão de crédito":
  drawer==="loan"?"Empréstimo / financiamento":
  drawer==="goal_sim"?(form.goalId?"Editar planejamento":"Novo planejamento"):
  drawer==="capital_goal"?"Nova caixinha":
  drawer==="reserve_caixinha"?"Reservar na caixinha":
  drawer==="settle"?"Confirmar pagamento":
  drawer==="detail"?"Detalhes do lançamento":
  drawer==="budget"?"Orçamento mensal":
  "Bem ou patrimônio";

 const mobileFormTitle=
  newTitle?(intent==="transfer"?"Transferência":intent==="lend"?"Emprestar":form.direction==="income"?"Nova Receita":form.creditCardId?"Despesa Cartão":"Nova Despesa"):
  formTitle;

 const saveToneClass=
  newTitle&&intent==="bill"&&form.direction==="income"?" is-income":
  newTitle&&(intent==="transfer"||form.creditCardId)?" is-blue":"";

 const canSubmit=drawer!=="detail";
 const isCaixinhaW=w=>Boolean(w?.parent_wallet_id)||Boolean(w?.caixinha_purpose)||Boolean(w?.is_reserved)||w?.wallet_kind==="reserve"||w?.wallet_kind==="investment";
 const checkingWallets=wallets.filter(w=>!isCaixinhaW(w));
 const caixinhaBalanceOf=g=>{
  if(!g)return 0;
  if(g.wallet_id&&walletBalances[g.wallet_id]!==undefined&&walletBalances[g.wallet_id]!==null)return walletBalances[g.wallet_id];
  return 0;
 };
 const activeBankOrCardName=useMemo(()=>{
  if(form.creditCardId){
   const c=creditCards.find(x=>x.id===form.creditCardId);
   if(c)return c.name;
  }
  const w=wallets.find(x=>x.id===form.walletId);
  return w?.name||wallets[0]?.name||"Conta";
 },[form.creditCardId,form.walletId,creditCards,wallets]);

 return <div className={`overlay${isMobilePhone?" kc-mob-overlay":""}`} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className={`drawer${drawer==="goal_sim"?" drawer-wide":""}${isMobilePhone?" kc-mob-fullscreen-drawer":""}`} role="dialog" aria-modal="true" aria-label={isMobilePhone?mobileFormTitle:formTitle}>
   <header className={`drawer-head${isMobilePhone?" kc-mob-form-head":""}`}>
     <div className="kc-mob-form-head-left">
       <button type="button" className="plain-icon" onClick={onClose} aria-label="Fechar"><X size={23}/></button>
       <h2>{isMobilePhone?mobileFormTitle:formTitle}</h2>
     </div>
     <div className="kc-mob-form-head-right">
       {canSubmit?<button className={`save-pill${saveToneClass}`} form="entry-form" type="submit" disabled={busy}>{busy?"Salvando...":"Salvar"}</button>:<span className="drawer-head-spacer"/>}
       {isMobilePhone&&newTitle&&(
         <button type="button" className="plain-icon" aria-label="Trocar tipo de lançamento" aria-expanded={mobTypeSwitcherOpen} onClick={()=>setMobTypeSwitcherOpen(v=>!v)}>
           <MoreHorizontal size={21}/>
         </button>
       )}
     </div>
   </header>
   {error&&<div className="notice error" role="alert" style={{margin:"14px 20px"}}>{error}</div>}
   {drawer==="detail"?<div className="detail-layout">
    <div className="detail-amount"><small>{selectedTitleObj?.entry_kind==="transfer"?(selectedTitleObj?.direction==="income"?"Transferência recebida":"Transferência enviada"):selectedTitleObj?.direction==="income"?"A receber":"A pagar"}</small><strong>{money(cents(selectedTitleObj?.amount_cents))}</strong><p>{selectedTitleObj?.description}</p></div>
    <dl className="detail-fields">
      <div><dt>Conta</dt><dd>{wallets.find(w=>w.id===selectedTitleObj?.wallet_id)?.name||"—"}</dd></div>
      {selectedTitleObj?.entry_kind==="transfer"&&<div><dt>{selectedTitleObj?.direction==="expense"?"Conta de destino":"Conta de origem"}</dt><dd>{(()=>{
        const counterpart=rawData?.titles?.find(t=>t.transfer_id&&t.transfer_id===selectedTitleObj?.transfer_id&&t.id!==selectedTitleObj?.id);
        return wallets.find(w=>w.id===counterpart?.wallet_id)?.name||"Outra conta";
      })()}</dd></div>}
      <div><dt>{selectedTitleObj?.entry_kind==="transfer"?"Tipo":"Categoria"}</dt><dd>{selectedTitleObj?.category||"—"}</dd></div>
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
   </div>:<form id="entry-form" className={`entry-form${isMobilePhone&&titleEntry&&(!newTitle||intent==="bill")?" kc-mob-list-form":""}`} onSubmit={onSave}>
    {newTitle&&(!isMobilePhone||mobTypeSwitcherOpen||intent==="lend")&&<div className="direction-cards four" role="group" aria-label="Tipo de lançamento">
      <button type="button" className={`direction-card expense${intent==="bill"&&form.direction!=="income"?" active":""}`} aria-pressed={intent==="bill"&&form.direction!=="income"} onClick={()=>{setForm(old=>({...old,intent:"bill",direction:"expense",category:old.direction==="expense"?old.category:""}));setMobTypeSwitcherOpen(false);}}>
        <ArrowDownCircle size={20} aria-hidden="true"/>
        <div><strong>A pagar</strong><small>Conta ou gasto</small></div>
      </button>
      <button type="button" className={`direction-card income${intent==="bill"&&form.direction==="income"?" active":""}`} aria-pressed={intent==="bill"&&form.direction==="income"} onClick={()=>{setForm(old=>({...old,intent:"bill",direction:"income",creditCardId:"",category:old.direction==="income"?old.category:""}));setMobTypeSwitcherOpen(false);}}>
        <ArrowUpCircle size={20} aria-hidden="true"/>
        <div><strong>A receber</strong><small>Salário ou entrada</small></div>
      </button>
      <button type="button" className={`direction-card transfer${intent==="transfer"?" active":""}`} aria-pressed={intent==="transfer"} onClick={()=>{
        const fW = (checkingWallets.some(w => w.id === form.fromWalletId) ? form.fromWalletId : null) || checkingWallets[0]?.id || "";
        const tW = (checkingWallets.some(w => w.id === form.toWalletId && w.id !== fW) ? form.toWalletId : null) || (checkingWallets.find(w => w.id !== fW)?.id || "");
        setForm(old=>({...old,intent:"transfer",fromWalletId:fW,toWalletId:tW,transferredOn:old.transferredOn||old.dueOn||brDay(),settlementState:old.settlementState||"paid"}));
        setMobTypeSwitcherOpen(false);
      }}>
        <ArrowLeftRight size={20} aria-hidden="true"/>
        <div><strong>Transferir</strong><small>Entre contas</small></div>
      </button>
      <button type="button" className={`direction-card lend${intent==="lend"?" active":""}`} aria-pressed={intent==="lend"} onClick={()=>{setForm(old=>({...old,intent:"lend",lentOn:old.lentOn||brDay(),expectedRepaymentOn:old.expectedRepaymentOn||old.dueOn||brDay()}));setMobTypeSwitcherOpen(false);}}>
        <HandCoins size={20} aria-hidden="true"/>
        <div><strong>Emprestar</strong><small>Para alguém</small></div>
      </button>
    </div>}

    {/* TRANSFERÊNCIA ENTRE CONTAS */}
    {newTitle&&intent==="transfer"&&<>
      {checkingWallets.length < 2 ? (
        <div className="notice warning" style={{margin:"0 0 16px"}}>
          <strong>Você precisa de pelo menos 2 contas bancárias para transferir.</strong>
          <p style={{margin:"6px 0 0"}}>Para guardar dinheiro em reserva ou objetivos, use Planejamento → Reservar valor. Para transferir entre bancos, cadastre outra conta em Novo › Conta bancária.</p>
        </div>
      ) : (
        <>
          <div className="field-row major">
            <ReceiptText/>
            <input aria-label="Identificação da transferência (opcional)" placeholder="Ex.: Pix entre bancos (opcional)" value={form.description||""} maxLength={120} onChange={e=>field("description",e.target.value)}/>
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
                    const alt = checkingWallets.find(w => w.id !== newFrom);
                    if (alt) field("toWalletId", alt.id);
                  }
                }}
              >
                <option value="">Selecione a conta de origem</option>
                {checkingWallets.map(w=>(
                  <option key={w.id} value={w.id}>{w.name}{walletBalances[w.id]!=null?` (${money(walletBalances[w.id])})`:""}</option>
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
                {checkingWallets.map(w=>(
                  <option key={w.id} value={w.id} disabled={w.id === form.fromWalletId}>
                    {w.name}{walletBalances[w.id]!=null?` (${money(walletBalances[w.id])})`:""} {w.id === form.fromWalletId ? "(Mesma conta)" : ""}
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
            <p><strong>Sem impacto nos limites ou salário:</strong> Move saldo entre suas contas bancárias. Para separar dinheiro em metas ou reserva, use <strong>Planejamento → Reservar valor</strong>.</p>
          </div>
        </>
      )}
    </>}

    {/* EMPRESTAR DINHEIRO OU CARTÃO */}
    {newTitle&&intent==="lend"&&(()=>{
      const lendCard=form.lendCreditCardId?creditCards.find(c=>c.id===form.lendCreditCardId):null;
      const cardInst=lendCard?Math.max(1,Number(form.lendCardInstallments||1)):1;
      const repayInst=Math.max(1,Number(form.lendRepaymentCount||1));
      const hasInstallments=cardInst>1||repayInst>1;
      const rawAmt=amountValue();
      const totalLendCents=form.valueMode==="installment"&&hasInstallments?rawAmt*(lendCard?cardInst:repayInst):rawAmt;
      const lendDate=form.lentOn||brDay();
      const cardCycle=lendCard?computeInvoiceCycleForPurchase({purchaseDate:lendDate,closingDay:lendCard.closing_day,dueDay:lendCard.due_day}):null;
      const cardUsage=lendCard?computeCardUsage(lendCard,rawData?.titles||[]):null;
      const cardOverLimit=Boolean(cardUsage&&lendCard.limit_cents>0&&totalLendCents>cardUsage.availableLimitCents);
      return <>
        <div className="field-row major"><ReceiptText/><input aria-label="Descrição do empréstimo" placeholder="Ex.: Compras no cartão, Ajuda conserto" required value={form.description} maxLength={140} onChange={e=>field("description",e.target.value)}/></div>
        <div className="field-row money-input"><CircleDollarSign/><span>R$</span><MoneyInput ariaLabel="Valor emprestado em reais" value={form.amount} onChange={v=>field("amount",v)}/></div>

        <div className="form-group">
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

          <label>{creditCards.length>0?"De onde sai (conta ou cartão)":"De qual conta saiu"}
            <select required value={form.lendCreditCardId?`card:${form.lendCreditCardId}`:(form.walletId||"")} onChange={e=>{
              const v=e.target.value;
              if(v.startsWith("card:")){
                const cid=v.slice(5);
                const c=creditCards.find(x=>x.id===cid);
                const cyc=c?computeInvoiceCycleForPurchase({purchaseDate:form.lentOn||brDay(),closingDay:c.closing_day,dueDay:c.due_day}):null;
                const defWallet=c?.default_wallet_id||checkingWallets[0]?.id||wallets[0]?.id||"";
                setForm(old=>({...old,lendCreditCardId:cid,walletId:defWallet,lendRepaymentWalletId:old.lendRepaymentWalletId||defWallet,expectedRepaymentOn:cyc?.dueDate||old.expectedRepaymentOn}));
              }else{
                setForm(old=>({...old,lendCreditCardId:"",lendCardInstallments:1,walletId:v,lendRepaymentWalletId:v||old.lendRepaymentWalletId}));
              }
            }}>
              <option value="">Selecione a conta ou cartão</option>
              <optgroup label="Contas bancárias">
                {(checkingWallets.length?checkingWallets:wallets).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
              </optgroup>
              {creditCards.length>0&&(
                <optgroup label="Cartões de crédito">
                  {creditCards.map(c=><option key={c.id} value={`card:${c.id}`}>💳 {c.name} (vence dia {c.due_day})</option>)}
                </optgroup>
              )}
            </select>
          </label>

          <div className="form-grid">
            <label>{lendCard?"Data da compra":"Data de saída"}<input required type="date" max={brDay()} value={lendDate} onChange={e=>{
              const nextDate=e.target.value;
              if(lendCard&&nextDate){
                const cyc=computeInvoiceCycleForPurchase({purchaseDate:nextDate,closingDay:lendCard.closing_day,dueDay:lendCard.due_day});
                setForm(old=>({...old,lentOn:nextDate,expectedRepaymentOn:cyc.dueDate}));
              }else{
                field("lentOn",nextDate);
              }
            }}/></label>
            {lendCard?(
              <label>Parcelas no cartão
                <select value={cardInst>1?"installments":"1"} onChange={e=>{
                  const nextCount=e.target.value==="installments"?Math.max(2,cardInst):1;
                  setForm(old=>({...old,lendCardInstallments:nextCount,lendRepaymentCount:nextCount}));
                }}>
                  <option value="1">À vista (1x)</option>
                  <option value="installments">Parcelado (2x–60x)</option>
                </select>
              </label>
            ):(
              <label>Devolução pelo amigo
                <select value={repayInst>1?"installments":"1"} onChange={e=>{
                  const nextCount=e.target.value==="installments"?Math.max(2,repayInst):1;
                  field("lendRepaymentCount",nextCount);
                }}>
                  <option value="1">À vista (1x)</option>
                  <option value="installments">Parcelada (2x–60x)</option>
                </select>
              </label>
            )}
          </div>

          {lendCard&&cardInst>1&&(
            <div className="repeat-config">
              <div className="section-header"><h3>Parcelamento no cartão</h3><span>{cardInst}x</span></div>
              <div className="form-grid">
                <label>Qtd. de parcelas<input type="number" min="2" max="60" value={form.lendCardInstallments||2} onChange={e=>field("lendCardInstallments",Math.max(2,Math.min(60,Number(e.target.value||2))))}/></label>
                <label>Valor informado é<select value={form.valueMode||"total"} onChange={e=>field("valueMode",e.target.value)}><option value="total">Valor total</option><option value="installment">Valor da parcela</option></select></label>
              </div>
              <div className="repeat-preview">
                <strong>Total: {money(totalLendCents)}</strong>
                <span>{cardInst}x de {money(Math.round(totalLendCents/cardInst))}</span>
              </div>
            </div>
          )}

          {lendCard&&cardCycle&&(
            <div className={`notice ${cardOverLimit?"warning":"info"}`} style={{margin:0}}>
              <strong>Fatura inicial: {cardCycle.invoiceMonth} (venc. {fdate(cardCycle.dueDate)})</strong>
              <p style={{margin:"4px 0 0"}}>
                Limite disponível: <strong>{money(cardUsage.availableLimitCents)}</strong>
                {cardOverLimit?" — atenção: este valor excede o limite disponível do cartão!":" — as parcelas entram na fatura sem distorcer seus orçamentos pessoais."}
              </p>
            </div>
          )}

          {lendCard&&(
            <div className="form-grid">
              <label>Devolução pelo amigo
                <select value={repayInst>1?"installments":"1"} onChange={e=>field("lendRepaymentCount",e.target.value==="installments"?Math.max(2,repayInst):1)}>
                  <option value="1">À vista (1x)</option>
                  <option value="installments">Parcelada (2x–60x)</option>
                </select>
              </label>
              {repayInst>1&&(
                <label>Parcelas da devolução
                  <input type="number" min="2" max="60" value={form.lendRepaymentCount||2} onChange={e=>field("lendRepaymentCount",Math.max(2,Math.min(60,Number(e.target.value||2))))}/>
                </label>
              )}
            </div>
          )}

          {!lendCard&&repayInst>1&&(
            <div className="repeat-config">
              <div className="section-header"><h3>Parcelamento da devolução</h3><span>{repayInst}x</span></div>
              <div className="form-grid">
                <label>Qtd. de parcelas<input type="number" min="2" max="60" value={form.lendRepaymentCount||2} onChange={e=>field("lendRepaymentCount",Math.max(2,Math.min(60,Number(e.target.value||2))))}/></label>
                <label>Valor informado é<select value={form.valueMode||"total"} onChange={e=>field("valueMode",e.target.value)}><option value="total">Valor total</option><option value="installment">Valor da parcela</option></select></label>
              </div>
              <div className="repeat-preview">
                <strong>Total: {money(totalLendCents)}</strong>
                <span>{repayInst}x de {money(Math.round(totalLendCents/repayInst))}</span>
              </div>
            </div>
          )}

          {lendCard&&cardInst>1&&repayInst!==cardInst&&(
            <button type="button" className="mini-pill" onClick={()=>setForm(old=>({...old,lendRepaymentCount:cardInst,expectedRepaymentOn:cardCycle?.dueDate||old.expectedRepaymentOn}))}>
              Acompanhar parcelas do cartão ({cardInst}x)
            </button>
          )}

          <div className="form-grid">
            <label>{repayInst>1?"1ª devolução prevista":"Previsão de pagamento"}<input required type="date" min={lendDate} value={form.expectedRepaymentOn||lendDate} onChange={e=>field("expectedRepaymentOn",e.target.value)}/></label>
            <label>Conta para receber
              <select required value={form.lendRepaymentWalletId||form.walletId||""} onChange={e=>field("lendRepaymentWalletId",e.target.value)}>
                <option value="">Selecione a conta</option>
                {(checkingWallets.length?checkingWallets:wallets).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
          </div>
          <p className="hint" style={{margin:0}}>
            {lendCard
              ? "As parcelas entram na fatura do cartão e consomem o limite; os recebíveis da pessoa ficam vinculados ao pagamento."
              : "O valor sai da sua conta hoje e cria os recebíveis previstos na carteira dessa pessoa (acompanha virada de mês)."}
          </p>
        </div>
      </>;
    })()}

    {/* CONTA A PAGAR / A RECEBER (unificado) ou edição */}
    {titleEntry&&(!newTitle||intent==="bill")&&(isMobilePhone?(
      <div className="kc-mob-form-rows">
        {/* Linha 1: Descrição */}
        <div className="kc-mob-row">
          <AlignLeft size={20} className="kc-mob-row-icon" aria-hidden="true"/>
          <input
            className="kc-mob-row-input"
            aria-label="Descrição do lançamento"
            placeholder="Descrição"
            required
            value={form.description}
            maxLength={120}
            onChange={e=>field("description",e.target.value)}
          />
        </div>

        {/* Linha 2: Valor R$ 0,00 */}
        <div className="kc-mob-row kc-mob-row-money">
          <CircleDollarSign size={22} className="kc-mob-row-icon" aria-hidden="true"/>
          <span className="kc-mob-currency">R$</span>
          <MoneyInput ariaLabel="Valor em reais" value={form.amount} onChange={v=>field("amount",v)}/>
        </div>

        {/* Linha 3: Repetição */}
        {edit?(
          <div className="editing-scope-note" style={{margin:"10px 16px"}}>
            A alteração será aplicada <strong>somente a este lançamento</strong>.
          </div>
        ):(
          <>
            <div className="kc-mob-row">
              <Repeat2 size={20} className="kc-mob-row-icon" aria-hidden="true"/>
              <label className="kc-mob-row-stack">
                <span className="kc-mob-row-caption">Repetição</span>
                <div className="kc-mob-select-wrap">
                  <select value={form.mode} onChange={e=>field("mode",e.target.value)}>
                    <option value="single">Não recorrente</option>
                    <option value="monthly">Fixa mensal</option>
                    <option value="installments">Parcelada</option>
                  </select>
                  <ChevronDown size={17} aria-hidden="true"/>
                </div>
              </label>
            </div>
            {form.mode==="installments"&&(
              <div className="kc-mob-sub-block">
                <div className="kc-mob-sub-row">
                  <span>Total de parcelas (2 a 60)</span>
                  <input type="number" min="2" max="60" value={form.count} onChange={e=>field("count",e.target.value)}/>
                </div>
                <div className="kc-mob-sub-row">
                  <span>Começar na parcela</span>
                  <input type="number" min="1" max={form.count} value={form.startIndex} onChange={e=>field("startIndex",e.target.value)}/>
                </div>
                <div className="kc-mob-sub-row">
                  <span>O valor informado é</span>
                  <select value={form.valueMode} onChange={e=>field("valueMode",e.target.value)}>
                    <option value="total">Valor total</option>
                    <option value="installment">Valor da parcela</option>
                  </select>
                </div>
                <div className="kc-mob-sub-note">
                  <strong>{Math.max(0,Number(form.count)-Number(form.startIndex)+1)||0} parcelas futuras</strong>
                  <span>{form.valueMode==="installment"?"Mensal: "+money(amountValue()):"Total: "+money(amountValue())}</span>
                </div>
              </div>
            )}
            {form.mode==="monthly"&&(
              <div className="kc-mob-sub-block">
                <div className="kc-mob-sub-row">
                  <span>Encerrar em (opcional)</span>
                  <input type="date" min={form.dueOn} max="2099-12-31" value={form.endsOn||""} onChange={ev=>field("endsOn",ev.target.value)}/>
                </div>
              </div>
            )}
          </>
        )}

        {/* Linha 4: Data de Vencimento / Compra */}
        {newTitle&&form.direction!=="income"&&form.creditCardId?(()=>{
          const card=creditCards.find(c=>c.id===form.creditCardId);
          const pDate=form.occurredOn||brDay();
          const cyc=card?computeInvoiceCycleForPurchase({purchaseDate:pDate,closingDay:card.closing_day,dueDay:card.due_day}):null;
          return <>
            <div className="kc-mob-row kc-mob-row-inline">
              <CalendarDays size={20} className="kc-mob-row-icon" aria-hidden="true"/>
              <span className="kc-mob-inline-label">Data da Compra</span>
              <input className="kc-mob-date-right" required type="date" value={pDate} onChange={e=>setForm(old=>({...old,occurredOn:e.target.value,dueOn:e.target.value}))}/>
            </div>
            {cyc&&(
              <div className="kc-mob-sub-block">
                <div className="kc-mob-sub-note">
                  <strong>Fatura: {cyc.invoiceMonth}</strong>
                  <span>Vence em {fdate(cyc.dueDate)} (fecha dia {card.closing_day})</span>
                </div>
              </div>
            )}
          </>;
        })():newTitle&&form.mode==="single"&&form.settlementState==="paid"?(
          <div className="kc-mob-row kc-mob-row-inline">
            <CalendarDays size={20} className="kc-mob-row-icon" aria-hidden="true"/>
            <span className="kc-mob-inline-label">Data de Vencimento</span>
            <input className="kc-mob-date-right" required type="date" max={brDay()} value={form.settledOn||brDay()} onChange={e=>field("settledOn",e.target.value)}/>
          </div>
        ):(
          <div className="kc-mob-row kc-mob-row-inline">
            <CalendarDays size={20} className="kc-mob-row-icon" aria-hidden="true"/>
            <span className="kc-mob-inline-label">Data de Vencimento</span>
            <input className="kc-mob-date-right" required type="date" value={form.dueOn} onChange={e=>field("dueOn",e.target.value)}/>
          </div>
        )}

        {/* Linha 5: Efetivada (Toggle Switch nativo igual à Imagem 1) */}
        {newTitle&&form.mode==="single"&&!form.creditCardId&&(
          <div className="kc-mob-row kc-mob-row-inline">
            <CheckCircle2 size={20} className="kc-mob-row-icon" aria-hidden="true"/>
            <span className="kc-mob-inline-label">Efetivada</span>
            <button
              type="button"
              role="switch"
              aria-checked={form.settlementState==="paid"}
              aria-label="Marcar como efetivada"
              className={`kc-mob-switch${form.settlementState==="paid"?" is-on":""}`}
              onClick={()=>field("settlementState",form.settlementState==="paid"?"pending":"paid")}
            >
              <span className="kc-mob-switch-knob"/>
            </button>
          </div>
        )}

        {/* Linha 6: Categoria com Ícone Circular Colorido + Botão + */}
        <div className="kc-mob-row kc-mob-row-entity">
          <div className="kc-mob-entity-block">
            <span className="kc-mob-row-caption">Categoria</span>
            <input className="sr-only-input" tabIndex={-1} aria-hidden="true" required value={form.category} onChange={()=>{}}/>
            <div className="kc-mob-entity-controls">
              <button type="button" className="kc-mob-entity-trigger" onClick={()=>setBudgetPicker(true)}>
                <CategoryCircleIcon name={form.category||"Categoria"} direction={form.direction}/>
                <div className="kc-mob-entity-text">
                  <strong>{form.category||"Selecione a categoria"}</strong>
                  {form.direction==="expense"&&form.category&&(
                    <small>{formatBudgetMeta(form.category)}</small>
                  )}
                </div>
                <ChevronDown size={16} className="kc-mob-entity-caret" aria-hidden="true"/>
              </button>
              <button
                type="button"
                className="kc-mob-entity-action"
                aria-label="Nova categoria"
                onClick={()=>{setQuick("category");setNewName("");setQuickError("");}}
              >
                <Plus size={20}/>
              </button>
            </div>
          </div>
        </div>

        {/* Linha 7: Conta / Cartão com Logo Circular do Banco */}
        <div className="kc-mob-row kc-mob-row-entity">
          <div className="kc-mob-entity-block">
            <span className="kc-mob-row-caption">{form.creditCardId?"Cartão de crédito":"Conta"}</span>
            <div className="kc-mob-entity-controls">
              <div className="kc-mob-entity-select-box">
                <BankIcon name={activeBankOrCardName} size={36}/>
                {newTitle&&form.direction!=="income"&&creditCards.length>0?(
                  <select
                    required
                    value={form.creditCardId?`card:${form.creditCardId}`:form.walletId}
                    onChange={e=>{
                      const v=e.target.value;
                      if(v.startsWith("card:")){
                        const cid=v.slice(5);
                        const c=creditCards.find(x=>x.id===cid);
                        setForm(old=>({...old,creditCardId:cid,walletId:c?.default_wallet_id||old.walletId||wallets[0]?.id||"",settlementState:"pending",occurredOn:old.occurredOn||brDay()}));
                      }else{
                        setForm(old=>({...old,creditCardId:"",walletId:v}));
                      }
                    }}
                  >
                    <option value="">Selecione a conta ou cartão</option>
                    <optgroup label="Contas bancárias">
                      {wallets.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                    </optgroup>
                    <optgroup label="Cartões de crédito">
                      {creditCards.map(c=><option key={c.id} value={`card:${c.id}`}>💳 {c.name} (vence dia {c.due_day})</option>)}
                    </optgroup>
                  </select>
                ):(
                  <select required value={form.walletId} onChange={e=>field("walletId",e.target.value)}>
                    <option value="">Selecione uma conta</option>
                    {wallets.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                )}
                <ChevronDown size={16} className="kc-mob-entity-caret" aria-hidden="true"/>
              </div>
              <span className="kc-mob-entity-badge" aria-hidden="true">
                {form.creditCardId?<CreditCard size={19}/>:<ReceiptText size={19}/>}
              </span>
            </div>
          </div>
        </div>

        {/* Linha 8: Salvar e continuar */}
        {newTitle&&(
          <div className="kc-mob-row kc-mob-row-inline">
            <Repeat2 size={19} className="kc-mob-row-icon" aria-hidden="true"/>
            <span className="kc-mob-inline-label">Salvar e continuar lançando</span>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(form.keepOpen)}
              className={`kc-mob-switch${form.keepOpen?" is-on":""}`}
              onClick={()=>field("keepOpen",!form.keepOpen)}
            >
              <span className="kc-mob-switch-knob"/>
            </button>
          </div>
        )}

        {/* Linha 9: Data de Lançamento (Igual ao rodapé da Imagem 1) */}
        <div className="kc-mob-row kc-mob-row-inline kc-mob-row-footer">
          <Clock3 size={20} className="kc-mob-row-icon" aria-hidden="true"/>
          <span className="kc-mob-inline-label">Data de<br/>Lançamento</span>
          <span className="kc-mob-launch-meta">{fdate(brDay())}</span>
        </div>
      </div>
    ):<>
      <div className="field-row major"><ReceiptText/><input aria-label="Descrição do lançamento" placeholder={form.direction==="income"?"Ex.: Salário, Reembolso":"Ex.: Mercado, Aluguel, Energia"} required value={form.description} maxLength={120} onChange={e=>field("description",e.target.value)}/></div>
      <div className="field-row money-input"><CircleDollarSign/><span>R$</span><MoneyInput ariaLabel="Valor em reais" value={form.amount} onChange={v=>field("amount",v)}/></div>
      {edit?<div className="editing-scope-note">
        A alteração será aplicada <strong>somente a este lançamento</strong>. Outras parcelas permanecem como estão.
        {cents(selectedTitleObj?.settled_cents)>0&&(
          <div style={{marginTop:4}}>
            {cents(selectedTitleObj?.settled_cents)===cents(selectedTitleObj?.amount_cents)
              ? "Este lançamento já foi pago/recebido: alterar valor ou data sincronizará automaticamente o pagamento registrado no saldo da conta."
              : "Este lançamento já tem pagamento parcial: aumentar o valor manterá a diferença pendente."}
          </div>
        )}
      </div>:
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
          <div className="controlled-classification"><label>Categoria<select required value={form.category} onChange={e=>field("category",e.target.value)}><option value="">Selecione a categoria</option>{roots.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select></label><button type="button" className="inline-plus" aria-label="Nova categoria" onClick={()=>{setQuick("category");setNewName("");setQuickError("");}}><Plus size={20}/></button></div>
        ):(
          <div className="controlled-classification">
            <div className="budget-picker-field">
              <span className="field-caption">Categoria</span>
              <input className="sr-only-input" tabIndex={-1} aria-hidden="true" required value={form.category} onChange={()=>{}}/>
              <button type="button" className="budget-picker-trigger" onClick={()=>setBudgetPicker(true)}>
                <span>{form.category||"Selecione a categoria"}</span>
                <small>{form.category?formatBudgetMeta(form.category):"Escolher da lista ›"}</small>
              </button>
            </div>
            <button type="button" className="inline-plus" aria-label="Nova categoria" onClick={()=>{setQuick("category");setNewName("");setQuickError("");}}><Plus size={20}/></button>
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
    </>)}

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
      <p className="hint">Cadastre sua conta bancária ou carteira de uso diário. Para separar dinheiro em objetivos ou reserva, crie Caixinhas vinculadas à conta.</p>
      <div className="bank-picker-preview">
        <BankIcon name={form.name} size={40}/>
        <label style={{flex:1}}>Nome do banco ou conta<input required maxLength={90} value={form.name} onChange={e=>field("name",e.target.value)} placeholder="Ex.: Nubank, Itaú, Sicredi"/></label>
      </div>
      <div className="bank-picker-row" aria-label="Atalhos de bancos">
        {["nubank","itau","bradesco","bb","caixa","santander","inter","c6","picpay","mercado_pago","pagbank","neon","maree","sicredi","sicoob"].map(bid=>{
          const b=BANK_BRANDS.find(x=>x.id===bid);
          if(!b)return null;
          return <button key={b.id} type="button" className="bank-pick-chip" onClick={()=>field("name",b.name)} title={b.name}><BankIcon name={b.name} size={22}/><span>{b.name}</span></button>;
        })}
      </div>
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

    {drawer==="settle"&&<><p className="hint">Confirmar o valor pago ou recebido. A parte restante permanece pendente.</p><div className="settle-title">{selectedTitleObj?.description}<small>Saldo em aberto: {money(balanceDue)}</small></div><label>Valor efetivado (R$)<MoneyInput value={form.amount} onChange={v=>field("amount",v)} ariaLabel="Valor efetivado em reais"/></label><label>Data da efetivação<input required type="date" max={brDay()} value={form.settledOn} onChange={e=>field("settledOn",e.target.value)}/></label></>}
    {drawer==="budget"&&<>
      <div className="settle-title">{form.category}<small>Competência: {form.budgetMonth}</small></div>
      <label className="kc-check"><input type="checkbox" checked={form.budgetActive!==false} onChange={e=>field("budgetActive",e.target.checked)}/><span className="kc-check-box" aria-hidden="true"><Check size={12} strokeWidth={3}/></span><span>Controlar limite mensal nesta categoria</span></label>
      {form.budgetActive!==false&&<label>Limite mensal (R$)<MoneyInput value={form.amount} onChange={v=>field("amount",v)} ariaLabel="Limite mensal em reais"/></label>}
      {form.budgetActive===false&&<p className="hint">Esta categoria apenas acompanha os gastos, sem trava de limite mensal.</p>}
    </>}
    {drawer==="asset"&&<><label>Descrição do bem ou investimento<input required maxLength={120} placeholder="Ex.: Imóvel, Veículo, Previdência" value={form.label} onChange={e=>field("label",e.target.value)}/></label><label>Valor estimado (R$)<MoneyInput value={form.amount} onChange={v=>field("amount",v)} ariaLabel="Valor atual"/></label><p className="hint">Não inclua novamente o dinheiro já registrado nas suas contas ou carteiras.</p></>}

    {drawer==="loan"&&<>
      <p className="hint">O valor recebido entra na conta sem inflar sua renda mensal, e as parcelas são agendadas automaticamente.</p>
      <label>Identificação<input required maxLength={120} placeholder="Ex.: Empréstimo pessoal, Financiamento" value={form.description} onChange={e=>field("description",e.target.value)}/></label>
      <div className="form-grid">
        <label>Quanto você recebeu (R$)<MoneyInput value={form.loanPrincipal||"0,00"} onChange={v=>field("loanPrincipal",v)} ariaLabel="Valor recebido"/></label>
        <label>Data do recebimento<input required type="date" max={brDay()} value={form.loanReceivedOn||brDay()} onChange={e=>field("loanReceivedOn",e.target.value)}/></label>
      </div>
      <label className="kc-check"><input type="checkbox" checked={form.loanCreditWallet!==false} onChange={e=>field("loanCreditWallet",e.target.checked)}/><span className="kc-check-box" aria-hidden="true"><Check size={12} strokeWidth={3}/></span><span>Depositar valor recebido na conta selecionada</span></label>
      <label>Conta para depósito e parcelas<select required value={form.walletId} onChange={e=>field("walletId",e.target.value)}><option value="">Selecione uma conta</option>{(checkingWallets.length?checkingWallets:wallets).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      <div className="form-grid">
        <label>Número de parcelas<input required type="number" min="2" max="120" value={form.loanCount||"12"} onChange={e=>field("loanCount",e.target.value)}/></label>
        <label>Valor da parcela (R$)<MoneyInput value={form.amount} onChange={v=>field("amount",v)} ariaLabel="Valor da parcela"/></label>
      </div>
      <label>Vencimento da 1ª parcela<input required type="date" value={form.dueOn} onChange={e=>field("dueOn",e.target.value)}/></label>
      {(()=>{
        const safeC=v=>{try{return maskToCents(v||"0,00");}catch{return 0;}};
        const p=safeC(form.loanPrincipal);const inst=safeC(form.amount);const cnt=Math.max(2,Number(form.loanCount||12));
        const total=inst*cnt;const interest=Math.max(0,total-p);
        return inst>0?<div className="repeat-config"><div className="repeat-preview" style={{borderTop:0,paddingTop:0}}><strong>Total a pagar: {money(total)} ({cnt}x de {money(inst)})</strong><span>Juros embutidos no período: {money(interest)}</span></div></div>:null;
      })()}
    </>}

    {drawer==="goal_sim"&&(
      <PlanningWizard
        form={form}
        setForm={setForm}
        wallets={checkingWallets.length ? checkingWallets : wallets}
        walletBalances={walletBalances}
        caixinhas={caixinhas}
        categories={categories}
        budgets={budgets}
        rawData={rawData}
        creditCards={creditCards}
      />
    )}
    {false&&drawer==="goal_sim"&&<>
      <select value={form.downPaymentSource||"checking"} onChange={e=>field("downPaymentSource",e.target.value)}><option value="checking">checking</option></select>
    </>}

    {drawer==="capital_goal"&&<>
      <p className="hint">Cada Caixinha tem saldo próprio dentro do banco que você escolher, separado do uso diário.</p>
      <div className="direction-cards three" role="group" aria-label="Finalidade da caixinha">
        {[
          ["reserve","Reserva","Emergência e proteção"],
          ["goal","Objetivo","Carro, viagem ou entrada"],
          ["capital","Capital","Investimento e longo prazo"]
        ].map(([k,lbl,sub])=>(
          <button key={k} type="button" className={`direction-card ${(form.caixinhaPurpose||"goal")===k?"active":""}`} onClick={()=>field("caixinhaPurpose",k)}>
            <div><strong>{lbl}</strong><small>{sub}</small></div>
          </button>
        ))}
      </div>
      <div className="bank-picker-row" aria-label="Sugestões de caixinhas">
        {((form.caixinhaPurpose||"goal")==="reserve"
          ? ["Reserva de emergência","Colchão de segurança"]
          : (form.caixinhaPurpose||"goal")==="capital"
            ? ["Aporte de Capital","Fundo de liberdade","Aposentadoria"]
            : ["Entrada do carro","Viagem","Reformar a casa","Trocar de celular"]
        ).map(preset=>(
          <button key={preset} type="button" className="bank-pick-chip" onClick={()=>field("description",preset)}>
            <span>{preset}</span>
          </button>
        ))}
      </div>
      <label>Nome da caixinha<input required maxLength={120} placeholder="Ex.: Reserva de emergência, Entrada do carro" value={form.description} onChange={e=>field("description",e.target.value)}/></label>
      <label>Banco / Conta onde fica o dinheiro
        <select required value={form.parentWalletId||checkingWallets[0]?.id||""} onChange={e=>field("parentWalletId",e.target.value)}>
          <option value="">Selecione a conta</option>
          {checkingWallets.map(w=>(
            <option key={w.id} value={w.id}>{w.name}{walletBalances[w.id]!=null?` (Livre: ${money(walletBalances[w.id])})`:""}</option>
          ))}
        </select>
      </label>
      <div className="form-grid">
        <label>Meta (R$)<MoneyInput value={form.goalTarget||"0,00"} onChange={v=>field("goalTarget",v)} ariaLabel="Valor da meta em reais"/></label>
        <label>Prazo<input required type="date" min={brDay()} value={form.goalDesiredOn||brDay()} onChange={e=>field("goalDesiredOn",e.target.value)}/></label>
      </div>
      <label>Guardar valor inicial agora? (opcional, R$)
        <MoneyInput value={form.initialAmount||"0,00"} required={false} onChange={v=>field("initialAmount",v)} ariaLabel="Valor inicial a reservar agora"/>
      </label>
      {(()=>{
        const safeC=v=>{try{return maskToCents(v||"0,00");}catch{return 0;}};
        const pace=computeCapitalPace({targetCents:safeC(form.goalTarget),targetDate:form.goalDesiredOn||brDay(),currentCapitalCents:safeC(form.initialAmount),monthlyContributionCents:Number(form.monthlyCapitalContributionCents||0),today:brDay()});
        return pace.targetCents>0?<div className="goal-verdict ok">
          <PiggyBank size={18}/>
          <div>
            <strong>Ritmo para atingir a meta: {money(pace.requiredMonthlyCents)}/mês</strong>
            <small>{pace.monthsLeft} mês(es) até {fdate(form.goalDesiredOn||brDay())} · Faltam {money(pace.remainingCents)} após o depósito inicial.</small>
          </div>
        </div>:null;
      })()}
    </>}

    {drawer==="reserve_caixinha"&&<>
      {caixinhas.length===0||checkingWallets.length===0?(
        <div className="notice warning">
          <strong>{checkingWallets.length===0?"Cadastre uma conta bancária primeiro.":"Crie uma caixinha antes de reservar dinheiro."}</strong>
        </div>
      ):(
        <>
          <div className="direction-cards compact" role="group" aria-label="Tipo de movimento na caixinha">
            <button type="button" className={`direction-card income${(form.reserveDirection||"deposit")==="deposit"?" active":""}`} onClick={()=>field("reserveDirection","deposit")}>
              <div><strong>Guardar</strong><small>Conta → Caixinha</small></div>
            </button>
            <button type="button" className={`direction-card neutral${form.reserveDirection==="withdraw"?" active":""}`} onClick={()=>field("reserveDirection","withdraw")}>
              <div><strong>Resgatar</strong><small>Caixinha → Conta</small></div>
            </button>
          </div>
          <label>{form.reserveDirection==="withdraw"?"Para qual conta bancária vai o resgate?":"De qual conta bancária sai o valor?"}
            <select required value={form.fromWalletId||checkingWallets[0]?.id||""} onChange={e=>field("fromWalletId",e.target.value)}>
              <option value="">Selecione a conta</option>
              {checkingWallets.map(w=>(
                <option key={w.id} value={w.id}>{w.name}{walletBalances[w.id]!=null?` (Livre: ${money(walletBalances[w.id])})`:""}</option>
              ))}
            </select>
          </label>
          <label>Filtrar por banco da caixinha (opcional)
            <select value={form.reserveBankFilter||""} onChange={e=>{
              const bId=e.target.value;
              const filtered=bId?caixinhas.filter(c=>c.parent_wallet_id===bId):caixinhas;
              setForm(old=>({...old,reserveBankFilter:bId,caixinhaId:filtered[0]?.id||""}));
            }}>
              <option value="">Todos os bancos</option>
              {checkingWallets.filter(w=>caixinhas.some(c=>c.parent_wallet_id===w.id)).map(w=>(
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </label>
          <label>{form.reserveDirection==="withdraw"?"Resgatar de qual caixinha?":"Guardar em qual caixinha?"}
            <select required value={form.caixinhaId||""} onChange={e=>field("caixinhaId",e.target.value)}>
              <option value="">Selecione a caixinha</option>
              {(form.reserveBankFilter?caixinhas.filter(c=>c.parent_wallet_id===form.reserveBankFilter):caixinhas).map(c=>{
                const bName=checkingWallets.find(w=>w.id===c.parent_wallet_id)?.name||"Sem banco";
                return <option key={c.id} value={c.id}>{c.title} ({bName} · Saldo: {money(caixinhaBalanceOf(c))})</option>;
              })}
            </select>
          </label>
          <div className="form-grid">
            <label>Valor (R$)<MoneyInput value={form.amount} onChange={v=>field("amount",v)} ariaLabel="Valor em reais"/></label>
            <label>Data<input required type="date" max={brDay()} value={form.transferredOn||brDay()} onChange={e=>field("transferredOn",e.target.value)}/></label>
          </div>
          <div className="transfer-guideline-note">
            {(form.reserveDirection||"deposit")==="withdraw" ? (
              <p><strong>Resgate seguro:</strong> Saldo máximo disponível nesta caixinha: <strong>{money(caixinhaBalanceOf(caixinhas.find(c=>c.id===form.caixinhaId)))}</strong>.</p>
            ) : (
              <p>
                <strong>Saldo separado e proteção de contas:</strong>{" "}
                {safeContribution && safeContribution.canContribute
                  ? `Sugestão de aporte seguro neste mês sem faltar para contas: ${money(safeContribution.safeContributionCents)}.`
                  : safeContribution && safeContribution.status === "prioritize_bills"
                    ? "Priorize quitar as contas deste mês antes de fazer novos aportes."
                    : "Reservar move o valor do seu uso diário para a caixinha sem alterar receitas ou despesas."}
              </p>
            )}
          </div>
        </>
      )}
    </>}
   </form>}
 </section>
 {budgetPicker&&<div className="nested-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setBudgetPicker(false);}}>
   <div className="quick-category budget-picker-dialog" role="dialog" aria-modal="true" aria-label="Selecionar categoria">
     <div className="quick-head">
       <h3>Selecionar categoria</h3>
       <button type="button" aria-label="Fechar" onClick={()=>setBudgetPicker(false)}><X size={20}/></button>
     </div>
     <div className="action-menu">
       {roots.map(c=>{
         const meta=formatBudgetMeta(c.name);
         const isOver=meta.startsWith("Estourado");
         return <button type="button" key={c.id} className={form.category===c.name?"selected":""} onClick={()=>{setForm(old=>({...old,category:c.name,spendingPlanId:""}));setBudgetPicker(false);}}>
           <span style={{display:"flex",alignItems:"center",gap:12}}>
             <CategoryCircleIcon name={c.name} direction={form.direction}/>
             <span>{c.name}{meta&&<small className={isOver?"red":""}>{meta}</small>}</span>
           </span>
           <span>{form.category===c.name?<Check size={16}/>:"›"}</span>
         </button>;
       })}
     </div>
     <button type="button" className="light-button" onClick={()=>{setBudgetPicker(false);setQuick("category");setNewName("");setQuickError("");}}>
       <Plus size={16}/> Nova categoria
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
 {quick&&<div className="nested-overlay" onMouseDown={e=>{if(e.target===e.currentTarget){setQuick(null);setTrackBudget(false);setQuickLimit("");}}}><form className="quick-category" onSubmit={createCategory}><div className="quick-head"><h3>Nova categoria</h3><button type="button" aria-label="Fechar" onClick={()=>{setQuick(null);setTrackBudget(false);setQuickLimit("");}}><X size={20}/></button></div><label>Nome<input required maxLength={80} autoFocus value={newName} onChange={e=>setNewName(e.target.value)} placeholder={form.direction==="income"?"Ex.: Freelance":"Ex.: Transporte"}/></label>{form.direction==="expense"&&<><label className="kc-check"><input type="checkbox" checked={trackBudget} onChange={e=>setTrackBudget(e.target.checked)}/><span className="kc-check-box" aria-hidden="true"><Check size={12} strokeWidth={3}/></span><span>Controlar limite mensal</span></label>{trackBudget&&<><label>Limite mensal (R$)<MoneyInput value={quickLimit} onChange={setQuickLimit} ariaLabel="Limite mensal em reais"/></label><p className="hint" style={{margin:"-4px 0 0"}}>Se a soma dos limites passar da renda de {selectedMonth||brDay().slice(0,7)}, os demais limites variáveis são recalculados automaticamente (preservando Reserva e Capital).</p></>}</>}{quickError&&<div className="notice error" role="alert">{quickError}</div>}<button type="submit" className="dark-button" disabled={quickBusy}>{quickBusy?"Salvando...":"Adicionar"}</button></form></div>}
 </div>;
}
