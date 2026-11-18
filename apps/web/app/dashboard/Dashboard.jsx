"use client";
import {useEffect,useMemo,useState} from "react";
import {LayoutDashboard,ArrowLeftRight,CalendarDays,Wallet,Landmark,FileText,Settings2,ChevronDown,Plus,ArrowUpRight,ArrowDownLeft,ArrowRight,LogOut,X,Check,Repeat2,TrendingUp,AlertTriangle,Search,Trash2,ShieldCheck,CircleDollarSign,Target,CalendarRange,MoreHorizontal,Info,ReceiptText,SlidersHorizontal,Menu} from "lucide-react";
import {authClient} from "../../lib/auth/client";
import {money,cents,brDay,monthOf,isoDate} from "../../lib/finance";
import {computeRange,lastDayOfMonth,firstDayOfMonth,moveMonth,inRange} from "../../lib/period";
import {maskToDecimal,centsToMask} from "../../lib/money-input";
import {expandRecurring} from "../../lib/recurring";
import EntryDrawer from "./EntryDrawer";
import MovementList from "./MovementList";
import FinanceChart from "./FinanceChart";
const TABS=[["overview","Visão geral",LayoutDashboard],["movements","Movimentos",ArrowLeftRight],["planning","Planejamento",CalendarRange],["registers","Cadastros",Wallet],["account","Conta",Settings2]];
const CATS={expense:["Moradia","Alimentação","Transporte","Saúde","Lazer","Educação","Assinaturas","Empréstimos","Outros"],income:["Salário","Renda extra","Benefícios","Rendimentos","Reembolsos","Outros"]};
const TODAY=brDay();const END=TODAY.slice(0,4)+"-12-31";const fmtDate=d=>{const s=isoDate(d).split("-");return s.length===3?s[2]+"/"+s[1]+"/"+s[0]:"—";};
const ymLabel=m=>new Date(m+"-15T12:00:00Z").toLocaleDateString("pt-BR",{month:"short",timeZone:"UTC"}).replace(".","");
const display=v=>v===null||v===undefined?"A calcular":money(v);
async function request(method="GET",body=null){
 const res=await fetch("/api/portfolio",{method,credentials:"same-origin",cache:"no-store",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
 const reply=await res.json().catch(()=>({error:"Resposta inesperada."}));if(!res.ok)throw new Error(reply.error||"Não foi possível concluir.");return reply;
}
const defaultForm=(kind="expense")=>({description:"",amount:"",direction:kind,category:CATS[kind][0],subcategory:"",dueOn:TODAY,mode:"single",count:"6",startIndex:"1",valueMode:"total",walletId:"",name:"",balance:"0,00",label:"",settledOn:TODAY,keepOpen:false});
function Kpi({title,value,sub,accent=false,icon:Icon=CircleDollarSign,action}){
 return <section className={"metric "+(accent?"metric-orange":"")+(action?" clickable":"")} onClick={action} tabIndex={action?0:undefined} onKeyDown={e=>{if(action&&(e.key==="Enter"||e.key===" "))action();}}>
  <div className="metric-label"><span>{title}</span><span className="metric-icon"><Icon size={19}/></span></div>
  <div className="metric-value">{display(value)}</div><div className="metric-sub">{sub}</div>
 </section>;
}
function LineHeading({title,small,children}){return <div className="section-header"><div>{small&&<div className="eyebrow">{small}</div>}<h2>{title}</h2></div>{children}</div>;}
function Empty({children}){return <div className="empty"><Info size={19}/><span>{children}</span></div>;}
function Status({title}){const left=cents(title.amount_cents)-cents(title.settled_cents);return <span className={"status "+(left===0?"done":cents(title.settled_cents)>0?"partial":isoDate(title.due_on)<TODAY?"late":"pending")}>{left===0?"Quitado":cents(title.settled_cents)>0?"Parcial":isoDate(title.due_on)<TODAY?"Vencido":"Pendente"}</span>;}
export default function Dashboard({user}){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [active,setActive]=useState("overview"),[rangeStart,setRangeStart]=useState(TODAY),[date,setDate]=useState(lastDayOfMonth(TODAY)),[drawer,setDrawer]=useState(null),[form,setForm]=useState(defaultForm()),[filter,setFilter]=useState("all"),[query,setQuery]=useState(""),[selectedTitle,setSelectedTitle]=useState(null);
 async function refresh(){try{const x=await request();setData(x);setError("");}catch(e){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{refresh();},[]);
 const expanded=useMemo(()=>expandRecurring(data||{},rangeStart<TODAY?rangeStart:TODAY,date<TODAY?TODAY:date),[data,rangeStart,date]);
 const summary=useMemo(()=>computeRange(expanded,rangeStart,date,TODAY),[expanded,rangeStart,date]);
 const wallets=data?.wallets||[],titles=expanded?.titles||[];
 const selectedTitleObj=titles.find(x=>x.id===selectedTitle);
 const months=summary.months.map(m=>({...m,label:ymLabel(m.month)}));
 const charts=months.length?months:[];
 const expenses=Object.entries(summary.categoryTotals).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
 const rows=titles.filter(t=>inRange(t.due_on,rangeStart,date)&&(filter==="all"||t.direction===filter)&&(!query||t.description.toLowerCase().includes(query.toLowerCase())||t.category.toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>isoDate(a.due_on).localeCompare(isoDate(b.due_on)));
 const walletName=id=>wallets.find(w=>w.id===id)?.name||"Conta";
 const walletBalance=w=>w.opening_balance_cents===null?null:cents(w.opening_balance_cents)+(data?.settlements||[]).filter(x=>!x.reversed_at&&x.wallet_id===w.id&&w.opening_at&&new Date(x.created_at)>new Date(w.opening_at)).reduce((a,x)=>a+(x.direction==="income"?1:-1)*cents(x.amount_cents),0);

 function open(kind,id){
   const t=titles.find(t=>t.id===id),dir=kind==="income"?"income":t?.direction||"expense";
   setForm({...defaultForm(dir),walletId:t?.wallet_id||wallets[0]?.id||"",category:t?.category||CATS[dir][0],amount:kind==="settle"&&t?centsToMask(Math.max(0,cents(t.amount_cents)-cents(t.settled_cents))):"",direction:dir});
   setSelectedTitle(id||null);setError("");setDrawer(kind);
 }
 function editTitle(id,duplicate=false){
   const t=titles.find(t=>t.id===id);if(!t)return;
   setForm({...defaultForm(t.direction),description:duplicate?t.description.replace(/ \(\d+\/\d+\)$/,""):t.description,amount:centsToMask(cents(t.amount_cents)),direction:t.direction,category:t.category,subcategory:t.subcategory||"",walletId:t.wallet_id,dueOn:isoDate(t.due_on),mode:"single"});
   setSelectedTitle(duplicate?null:id);setError("");setDrawer(duplicate?"title":"edit");
 }
 const field=(name,val)=>setForm(old=>({...old,[name]:val}));
 async function addCategory(payload){await request("POST",{action:"category",...payload});await refresh();}
 async function materializeIfVirtual(id){
   if(!String(id||"").startsWith("rec:"))return id;
   const response=await request("POST",{action:"materialize",occurrenceId:id});
   if(!response.id)throw new Error("Não foi possível registrar esta ocorrência.");
   return response.id;
 }
 async function submit(e){
   e.preventDefault();if(busy)return;setBusy(true);setError("");
   try{
     if(drawer==="settle"){
       const titleId=await materializeIfVirtual(selectedTitle);
       await request("PATCH",{action:"settle",titleId,amount:maskToDecimal(form.amount),settledOn:form.settledOn,idempotency:crypto.randomUUID()});
     }
     else if(drawer==="wallet")await request("POST",{action:"wallet",name:form.name,balance:maskToDecimal(form.balance,{allowNegative:true})});
     else if(drawer==="asset"||drawer==="liability")await request("POST",{action:drawer,label:form.label,amount:maskToDecimal(form.amount)});
     else{
       const payload={walletId:form.walletId,direction:form.direction,description:form.description,category:form.category,subcategory:form.subcategory||null,amount:maskToDecimal(form.amount),dueOn:form.dueOn};
       if(drawer==="edit"){
         const titleId=await materializeIfVirtual(selectedTitle);
         await request("PATCH",{action:"edit",titleId,...payload});
       }
       else await request("POST",{action:"title",...payload,mode:form.mode,valueMode:form.valueMode,count:form.count,startIndex:form.startIndex,endsOn:form.endsOn||null});
     }
     setNotice("Operação salva. Os valores e as projeções foram atualizados.");await refresh();
     if(!form.keepOpen||drawer!=="title")setDrawer(null);
     else setForm(old=>({...old,description:"",amount:""}));
   }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function cancelTitle(t){
   if(!window.confirm("Excluir este lançamento sem baixa?"))return;
   setBusy(true);setError("");
   try{const titleId=await materializeIfVirtual(t.id);await request("PATCH",{action:"cancel",titleId});setNotice("Lançamento excluído.");await refresh();setDrawer(null);}
   catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function reverseSettlement(id){
   if(!window.confirm("Desfazer esta baixa? O histórico será preservado e o valor voltará a ficar pendente."))return;
   setBusy(true);setError("");
   try{await request("PATCH",{action:"reverse",settlementId:id});await refresh();setNotice("Baixa revertida. O histórico foi preservado.");}
   catch(e){setError(e.message);}
   finally{setBusy(false);}
 }
 async function stopRecurring(id){
   const t=titles.find(t=>t.id===id);
   if(!t?.series_id||!window.confirm("Encerrar a repetição a partir desta ocorrência? Meses anteriores serão mantidos."))return;
   setBusy(true);setError("");
   try{await request("PATCH",{action:"stop_recurring",ruleId:t.series_id,startsOn:isoDate(t.due_on)});await refresh();setNotice("Recorrência encerrada a partir da data escolhida.");setDrawer(null);}
   catch(e){setError(e.message);}
   finally{setBusy(false);}
 }
 function handleAction(action,id){
   if(action==="reverse"){reverseSettlement(id);return;}
   if(action==="stop_recurring"){stopRecurring(id);return;}
   const t=titles.find(t=>t.id===id);if(!t)return;
   if(action==="detail")open("detail",id);
   if(action==="edit")editTitle(id);
   if(action==="duplicate")editTitle(id,true);
   if(action==="settle")open("settle",id);
   if(action==="cancel")cancelTitle(t);
 }
 function selectMonth(delta){
   const next=moveMonth(rangeStart,delta),first=firstDayOfMonth(next+"-01");
   setRangeStart(first);setDate(lastDayOfMonth(first));
 }
 const setTab=k=>{setActive(k);setNotice("");};
 const totalCards=[
  ["A receber",summary.receivable.total,"Entradas dentro do período",ArrowDownLeft],
  ["A pagar",summary.payable.total,"Saídas dentro do período",ArrowUpRight],
  ["Resultado do período",summary.periodResult,"Entradas menos saídas do intervalo",TrendingUp]
 ];
 const selectedMonth=summary.targetMonth;
 const monthLong=new Date(selectedMonth+"-15T12:00:00Z").toLocaleDateString("pt-BR",{month:"long",year:"numeric",timeZone:"UTC"});
 function titlesTable(compact=false){
  const subset=compact?rows.filter(x=>cents(x.amount_cents)>cents(x.settled_cents)).slice(0,5):rows;
  return <MovementList items={subset} compact={compact} today={TODAY} walletName={walletName} onDetails={id=>open("detail",id)} onAction={handleAction}/>;
 }
 if(loading)return <main className="loading"><span className="brand-logo">k</span> Preparando seu painel...</main>;
 return <div className="shell"><header className="topbar"><button className="brand" onClick={()=>setTab("overview")}><span className="brand-logo">k</span><strong>kuantoconta</strong></button><nav className="top-nav" aria-label="Principal">{TABS.map(([key,label])=><button key={key} onClick={()=>setTab(key)} className={active===key?"active":""}>{label}</button>)}</nav><div className="top-right"><span className="top-tag">V1 · Preview</span><button className="avatar" title={user.email} onClick={()=>setTab("account")}>{(user.name||user.email||"U").slice(0,1).toUpperCase()}</button></div></header>
 <aside className="rail" aria-label="Atalhos">{TABS.map(([key,label,Icon])=><button title={label} aria-label={label} className={active===key?"active":""} key={key} onClick={()=>setTab(key)}><Icon size={20}/></button>)}<span className="rail-space"/><button title="Sair" onClick={async()=>{await authClient.signOut();window.location.replace("/auth/sign-in");}}><LogOut size={20}/></button></aside>
 <main className="content"><div className="page-header"><div><span className="eyebrow">SEU FUTURO FINANCEIRO</span><h1>{active==="overview"?"Seu dinheiro, com clareza.":TABS.find(t=>t[0]===active)?.[1]}</h1><p>{active==="overview"?"Acompanhe suas contas, entenda os gastos e veja onde seu planejamento pode chegar.":"Números reais do seu cadastro, sem dados de demonstração."}</p></div><div className="period-picker range-picker"><label><span>Início</span><input aria-label="Início do período" type="date" value={rangeStart} max={date} onChange={e=>{const v=e.target.value||TODAY;setRangeStart(v);if(v>date)setDate(v);}}/></label><span className="range-dash">—</span><label><span>Fim</span><input aria-label="Fim do período" type="date" min={rangeStart} max="2099-12-31" value={date} onChange={e=>setDate(e.target.value>=rangeStart?e.target.value:rangeStart)}/></label><button className="range-shortcut" type="button" onClick={()=>{setRangeStart(TODAY);setDate(END);}}>Fim do ano</button></div></div>
 {error&&<div className="notice error" role="alert">{error}<button onClick={()=>setError("")} aria-label="Fechar"><X size={16}/></button></div>}
 {notice&&<div className="notice success" role="status">{notice}<button onClick={()=>setNotice("")} aria-label="Fechar"><X size={16}/></button></div>}
 {active==="overview"&&<div className="overview-grid">
 <section className="balance-card panel"><div className="section-header"><div><div className="eyebrow">CARTEIRAS</div><h2>Saldo disponível hoje</h2></div><span className="badge">BRL</span></div><div className="balance-num">{display(summary.liveCash)}</div><p>Saldo de abertura mais baixas registradas após a referência.</p><div className="balance-actions"><button className="dark-button" onClick={()=>open("wallet")}><Plus size={17}/> Nova conta</button><button className="light-button" onClick={()=>open("title")}><Plus size={17}/> Nova despesa</button></div><div className="wallet-strip"><div className="wallet-strip-head"><strong>Suas contas</strong><span>{wallets.length} cadastradas</span></div><div className="wallet-cards">{wallets.length?wallets.slice(0,4).map(w=><div className="mini-wallet" key={w.id}><Wallet size={18}/><strong>{w.name}</strong><b>{display(walletBalance(w))}</b><small>Saldo realizado estimado</small></div>):<Empty>Comece cadastrando uma conta e seu saldo inicial.</Empty>}</div></div></section>
 <div className="metric-grid">{totalCards.map(([title,value,sub,Icon],i)=><Kpi key={title} title={title} value={value} sub={sub} icon={Icon} accent={i===0} action={()=>setTab("movements")}/>)}<Kpi title="Patrimônio parcial projetado" value={summary.netWorthPartial} sub={"Em "+fmtDate(date)+" · saldo projetado + ativos − passivos"} icon={Landmark}/></div>
 <section className="panel chart-panel"><LineHeading small="EVOLUÇÃO FINANCEIRA" title="Saldo projetado"/>{summary.knownCash&&charts.length?<FinanceChart type="line" data={charts}/>:<Empty>Informe o saldo de uma conta para visualizar a evolução do dinheiro até a data escolhida.</Empty>}{summary.firstNegative&&<div className="alert"><AlertTriangle size={16}/> Possível déficit em {fmtDate(summary.firstNegative)}.</div>}</section>
 <section className="panel category-panel"><LineHeading small="PARA ONDE VAI" title="Despesas por categoria"/>{expenses.length?<FinanceChart type="donut" data={expenses}/>:<Empty>Cadastre despesas para descobrir seus maiores gastos.</Empty>}</section>
 <section className="panel monthly-panel"><LineHeading small="PERÍODO SELECIONADO" title="Receitas e despesas"/>{months.length&&months.some(m=>m.income||m.expense)?<FinanceChart type="bar" data={months}/>:<Empty>Seus próximos meses aparecerão aqui conforme você cadastrar os movimentos.</Empty>}</section>
 <section className="panel table-panel"><LineHeading title="Próximos compromissos"><button className="pill-button" onClick={()=>setTab("movements")}>Ver carteira <ArrowRight size={16}/></button></LineHeading>{titlesTable(true)}</section>
 </div>}
 {active==="movements"&&<div className="workspace"><LineHeading title="Carteira financeira"><div className="toolbar-buttons"><button className="light-button" onClick={()=>{open("title");setForm(old=>({...old,direction:"income",category:CATS.income[0]}));}}><Plus size={16}/> A receber</button><button className="dark-button" onClick={()=>open("title")}><Plus size={16}/> A pagar</button></div></LineHeading><section className="panel list-panel"><div className="filters"><div className="filter-pills">{[["all","Todos"],["expense","A pagar"],["income","A receber"]].map(([k,l])=><button key={k} className={filter===k?"active":""} onClick={()=>setFilter(k)}>{l}</button>)}</div><label className="search-input"><Search size={17}/><input placeholder="Buscar título ou categoria" value={query} onChange={e=>setQuery(e.target.value)}/></label></div><div className="movements-period-nav"><button type="button" onClick={()=>selectMonth(-1)} aria-label="Mês anterior">‹</button><strong>{new Date(summary.periodEnd+"T12:00:00Z").toLocaleDateString("pt-BR",{month:"long",year:"numeric",timeZone:"UTC"})}</strong><button type="button" onClick={()=>selectMonth(1)} aria-label="Próximo mês">›</button></div>{titlesTable()}</section></div>}
 {active==="planning"&&<div className="workspace"><LineHeading title="Planejamento por período"><span className="badge">{monthLong}</span></LineHeading><div className="planning-stats"><Kpi title="Receitas do período" value={summary.receivable.total} sub="Previstas e confirmadas" icon={ArrowDownLeft}/><Kpi title="Pagamentos do período" value={summary.payable.total} sub="Previstos e confirmados" icon={ArrowUpRight}/><Kpi title="Resultado do período" value={summary.periodResult} sub={summary.periodResult>=0?"Sobra estimada":"Déficit estimado"} icon={TrendingUp}/></div><section className="panel"><LineHeading title="Evolução mês a mês"/><div className="table-scroll"><table className="finance-table"><thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Sobra/deficit</th><th>Saldo acumulado</th></tr></thead><tbody>{months.map(m=><tr key={m.month}><td><strong>{new Date(m.month+"-15T12:00:00Z").toLocaleDateString("pt-BR",{month:"long",year:"numeric",timeZone:"UTC"})}</strong></td><td>{money(m.income)}</td><td>{money(m.expense)}</td><td className={m.result<0?"red":"green"}>{money(m.result)}</td><td className="money-cell">{display(m.balance)}</td></tr>)}</tbody></table></div></section><div className="planning-below"><section className="panel"><LineHeading title="Compromissos conhecidos"/><div className="large-line">{money(summary.allPayable)}</div><p>Soma de todas as contas a pagar ainda pendentes. Não confundir com passivo contratado ou patrimônio.</p></section><section className="panel"><LineHeading title="Quanto posso gastar?"/><div className="large-line">A calcular</div><p>Disponibilidade prudente depende da confirmação dos compromissos e de uma reserva de segurança. Este cálculo será homologado antes de gerar recomendações.</p></section></div></div>}
 {active==="registers"&&<div className="workspace"><LineHeading title="Suas contas e patrimônio"><button className="dark-button" onClick={()=>open("wallet")}><Plus size={16}/> Nova conta</button></LineHeading><div className="wallet-list">{wallets.length?wallets.map(w=><article className="panel account-panel" key={w.id}><div className="account-icon"><Wallet size={22}/></div><div><h3>{w.name}</h3><p>Saldo registrado em {w.opening_at?fmtDate(w.opening_at):"data não informada"}</p></div><strong>{display(w.opening_balance_cents)}</strong></article>):<section className="panel"><Empty>Nenhuma conta cadastrada.</Empty></section>}</div><div className="register-grid"><section className="panel"><LineHeading title="Bens e investimentos"><button className="tiny-btn" onClick={()=>open("asset")}><Plus size={16}/> Adicionar</button></LineHeading><div className="large-line">{money(summary.assets)}</div><p>Ativos fora dos saldos de conta.</p></section><section className="panel"><LineHeading title="Dívidas declaradas"><button className="tiny-btn" onClick={()=>open("liability")}><Plus size={16}/> Adicionar</button></LineHeading><div className="large-line">{money(summary.liabilities)}</div><p>Passivos declarados. Evolução automática de contratos financeiros será uma etapa própria.</p></section></div></div>}
 {active==="account"&&<div className="workspace"><section className="panel profile-panel"><div className="account-icon large">{(user.name||user.email||"U")[0].toUpperCase()}</div><div><h2>{user.name}</h2><p>{user.email}</p><div className="profile-links"><a href="/legal/terms">Termos de Uso</a><a href="/legal/privacy">Aviso de Privacidade</a></div><p>Prévia restrita. Dados financeiros protegidos por autenticação. Não informe dados reais até a homologação legal.</p><button className="dark-button" onClick={async()=>{await authClient.signOut();window.location.replace("/auth/sign-in");}}><LogOut size={17}/> Sair da conta</button></div></section></div>}
 </main>
 {drawer&&<EntryDrawer key={drawer+":"+String(selectedTitle||"new")} drawer={drawer} form={form} setForm={setForm} selectedTitleObj={selectedTitleObj} settlements={data?.settlements||[]} wallets={wallets} categories={data?.categories||[]} rules={data?.recurringRules||[]} busy={busy} error={error} onSave={submit} onClose={()=>setDrawer(null)} onAction={handleAction} onAddCategory={addCategory}/>}
 </div>;
}
