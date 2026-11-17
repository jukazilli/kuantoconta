// Pure monetary input helpers. Browser stores display text; API receives decimal BRL with a dot.
// No binary floating point calculations for parsing or masking money.
export function maskMoney(value,{allowNegative=false}={}){
 const sign=allowNegative&&String(value||"").trim().startsWith("-")?"-":"";
 const digits=String(value??"").replace(/\D/g,"").slice(-12);
 if(!digits)return "";
 const padded=digits.padStart(3,"0");
 const whole=padded.slice(0,-2).replace(/^0+(?=\d)/,"").replace(/\B(?=(\d{3})+(?!\d))/g,".");
 const decimals=padded.slice(-2);
 return sign+whole+","+decimals;
}
export function centsToMask(value){
 if(value===null||value===undefined||value==="")return "";
 const n=Number(value);
 if(!Number.isSafeInteger(n))throw new Error("Valor monetário fora do limite.");
 return maskMoney(String(Math.abs(n)).padStart(3,"0"),{allowNegative:false}).replace(/^/,n<0?"-":"");
}
export function maskToDecimal(value,{allowNegative=false}={}){
 const text=String(value??"").trim();
 const negative=allowNegative&&text.startsWith("-");
 const digits=text.replace(/\D/g,"").replace(/^0+(?=\d)/,"")||"0";
 if(digits.length>12)throw new Error("Valor monetário muito alto.");
 const padded=digits.padStart(3,"0");
 const whole=padded.slice(0,-2),fraction=padded.slice(-2);
 return (negative?"-":"")+whole+"."+fraction;
}
export function maskToCents(value,{allowNegative=false}={}){
 const decimal=maskToDecimal(value,{allowNegative});
 const neg=decimal.startsWith("-");
 const [whole,frac]=decimal.replace("-","").split(".");
 const n=Number(whole)*100+Number(frac);
 if(!Number.isSafeInteger(n))throw new Error("Valor monetário inválido.");
 return neg?-n:n;
}
