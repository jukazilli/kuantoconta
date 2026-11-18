import { auth } from "./auth/server";
import { sql } from "./db";
import { TERMS_VERSION, PRIVACY_VERSION } from "./legal";
export async function getIdentity(){
  const result = await auth.getSession();
  const user = result?.data?.user;
  return user?.id ? user : null;
}
export async function legalAccepted(userId){
  const rows = await sql`SELECT 1 FROM public.kc_legal_acceptances
   WHERE user_id=${userId} AND terms_version=${TERMS_VERSION} AND privacy_version=${PRIVACY_VERSION}
   LIMIT 1`;
  return rows.length>0;
}
export function sameOrigin(request){
  const origin=request.headers.get("origin");
  if(!origin)return true;
  return origin === new URL(request.url).origin;
}
export const PRIVATE_HEADERS={"Cache-Control":"private, no-store, max-age=0"};
