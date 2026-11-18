import AuthForm from "./AuthForm";
export const dynamic="force-dynamic";
export default function Page(){
 return <AuthForm signupEnabled={process.env.SIGNUP_ENABLED==="true"}/>;
}
