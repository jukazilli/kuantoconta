import { getIdentity,sameOrigin,PRIVATE_HEADERS } from "../../../../lib/authorization";
import { sql } from "../../../../lib/db";
import { TERMS_VERSION,PRIVACY_VERSION } from "../../../../lib/legal";
export const dynamic="force-dynamic";
export async function POST(request){
 if(!sameOrigin(request))return Response.json({error:"Origem inválida."},{status:403,headers:PRIVATE_HEADERS});
 const user=await getIdentity();
 if(!user)return Response.json({error:"Não autenticado."},{status:401,headers:PRIVATE_HEADERS});
 let body;try{body=await request.json();}catch{return Response.json({error:"JSON inválido."},{status:400,headers:PRIVATE_HEADERS});}
 if(body?.accepted!==true||body?.terms_version!==TERMS_VERSION||body?.privacy_version!==PRIVACY_VERSION)
  return Response.json({error:"É necessário confirmar a versão vigente de ambos os documentos."},{status:400,headers:PRIVATE_HEADERS});
 await sql`INSERT INTO public.kc_legal_acceptances(user_id,terms_version,privacy_version)
 VALUES(${user.id},${TERMS_VERSION},${PRIVACY_VERSION}) ON CONFLICT DO NOTHING`;
 return Response.json({accepted:true},{headers:PRIVATE_HEADERS});
}
