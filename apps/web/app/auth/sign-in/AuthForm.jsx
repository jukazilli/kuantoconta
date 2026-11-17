"use client";
import {useEffect,useState} from "react";
import {authClient} from "../../../lib/auth/client";
import {TERMS_VERSION,PRIVACY_VERSION} from "../../../lib/legal";
import {Wallet,ArrowRight,ShieldCheck,Eye,EyeOff} from "lucide-react";
export default function AuthForm({signupEnabled}){
 const [signup,setSignup]=useState(false),[name,setName]=useState(""),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[show,setShow]=useState(false),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const {data:session,isPending}=authClient.useSession();
 useEffect(()=>{if(!isPending&&session?.user)window.location.replace("/dashboard");},[session,isPending]);
 async function submit(e){e.preventDefault();setError("");if(signup&&!accepted){setError("É necessário aceitar os Termos e tomar ciência do Aviso de Privacidade.");return;}setBusy(true);
 try{
  const r=signup?await authClient.signUp.email({name:name.trim(),email:email.trim(),password}):await authClient.signIn.email({email:email.trim(),password});
  if(r?.error){setError(r.error.message||"Não foi possível entrar.");return;}
  if(signup){
   const res=await fetch("/api/legal/accept",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accepted:true,terms_version:TERMS_VERSION,privacy_version:PRIVACY_VERSION})});
   if(!res.ok){window.location.href="/legal/accept";return;}
  }
  window.location.href="/dashboard";
 }catch{setError("Não foi possível concluir a operação. Verifique a rede e tente novamente.");}finally{setBusy(false);}
 }
 return <main className="auth-page"><div className="auth-art"><div className="auth-brand"><span className="brand-icon">k</span><strong>kuantoconta</strong></div><div className="auth-hero"><span className="eyebrow">CONSCIÊNCIA FINANCEIRA</span><h1>Mais clareza hoje. Mais patrimônio amanhã.</h1><p>Entenda quanto ganha, quanto gasta e como poderá terminar o ano se mantiver seu planejamento.</p></div><div className="auth-art-bottom">Seu dinheiro. Seu plano. Seu futuro.</div></div><section className="auth-box"><div className="auth-form-panel"><div className="auth-mobile-brand"><span className="brand-icon">k</span><strong>kuantoconta</strong></div><span className="eyebrow">{signup?"NOVA CONTA":"BEM-VINDO"}</span><h2>{signup?"Crie seu acesso":"Entre na sua conta"}</h2><p>Suas informações financeiras são privadas e vinculadas à sua conta.</p><form onSubmit={submit}>
 {signup&&<label>Nome<input value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" placeholder="Como podemos chamar você?"/></label>}
 <label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" placeholder="voce@exemplo.com"/></label>
 <label>Senha<div className="password-wrap"><input type={show?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} autoComplete={signup?"new-password":"current-password"} placeholder="Mínimo 8 caracteres"/><button type="button" aria-label={show?"Ocultar senha":"Mostrar senha"} onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
 {signup&&<label className="legal-checkbox"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} required/><span>Li e aceito os <a target="_blank" rel="noopener noreferrer" href="/legal/terms">Termos de Uso</a> e declaro ciência do <a target="_blank" rel="noopener noreferrer" href="/legal/privacy">Aviso de Privacidade</a>.</span></label>}
 {error&&<div className="notice error" role="alert">{error}</div>}
 <button type="submit" className="primary-button" disabled={busy}>{busy?"Aguarde...":signup?"Criar conta":"Entrar"} <ArrowRight size={18}/></button>
 </form>
 {signupEnabled&&<button className="switch-auth" type="button" onClick={()=>{setSignup(!signup);setError("");setAccepted(false);}}>{signup?"Já possui conta? Entrar":"Não tem conta? Criar acesso"}</button>}
 <div className="auth-legal-note"><ShieldCheck size={17}/> {signupEnabled?"Ambiente protegido de testes. Não informe dados financeiros reais.":"Cadastro fechado até conclusão da revisão legal e de segurança."}</div>
 </div></section></main>;
}
