import { redirect } from "next/navigation";
import { getIdentity,legalAccepted } from "../../../lib/authorization";
import Acceptance from "./Acceptance";
export const dynamic="force-dynamic";
export default async function Page(){
 const user=await getIdentity();
 if(!user)redirect("/auth/sign-in");
 if(await legalAccepted(user.id))redirect("/dashboard");
 return <Acceptance/>;
}
