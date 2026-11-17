"use client";
import {useState} from "react";
import {TERMS_VERSION,PRIVACY_VERSION} from "../../../lib/legal";
import {ShieldCheck,ArrowRight} from "lucide-react";
export default function Acceptance(){const[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function accept(e){e.preventDefault();if(!checked)return;setBusy(true);setError("");try{const r=await fetch("/api/legal/accept",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accepted:true,terms_version:TERMS_VERSION,privacy_version:PRIVACY_VERSION})});if(!r.ok)throw new Error("Não foi possível registrar o aceite.");window.location.href="/dashboard";}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <main className="legal-screen"><section className="legal-card"><ShieldCheck size={28}/><h1>Antes de continuar</h1><p>Para acessar suas finanças, confirme que leu os documentos vigentes. Esta versão é uma prévia protegida de testes.</p><form onSubmit={accept}><label className="legal-checkbox"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} required/><span>Li e aceito os <a href="/legal/terms" target="_blank" rel="noopener noreferrer">Termos de Uso</a> e declaro ciência do <a href="/legal/privacy" target="_blank" rel="noopener noreferrer">Aviso de Privacidade</a>.</span></label>{error&&<div className="notice error" role="alert">{error}</div>}<button className="primary-button" disabled={!checked||busy}>Continuar <ArrowRight size={17}/></button></form></section></main>;
}
