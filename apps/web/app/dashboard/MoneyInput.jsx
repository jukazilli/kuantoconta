"use client";
import {maskMoney} from "../../lib/money-input";
export default function MoneyInput({value="",onChange,allowNegative=false,placeholder="0,00",ariaLabel,required=true,...props}){
 return <input {...props} type="text" inputMode="numeric" autoComplete="off" spellCheck={false} aria-label={ariaLabel} placeholder={placeholder} required={required} value={value} onChange={e=>onChange(maskMoney(e.target.value,{allowNegative}))}/>;
}
