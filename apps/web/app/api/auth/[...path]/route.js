import { auth } from "../../../../lib/auth/server";
import { REGISTER_ENABLED } from "../../../../lib/legal";
export const dynamic="force-dynamic";
const handlers=auth.handler();
export const GET=handlers.GET;
export const PUT=handlers.PUT;
export const DELETE=handlers.DELETE;
export const PATCH=handlers.PATCH;
export async function POST(request,context){
  const {path=[]}=await context.params;
  if(!REGISTER_ENABLED && path.includes("sign-up"))
    return Response.json({error:"Cadastro fechado até homologação legal."},{status:403,headers:{"Cache-Control":"no-store"}});
  return handlers.POST(request,context);
}
