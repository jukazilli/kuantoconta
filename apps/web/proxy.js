import { auth } from "./lib/auth/server";
export default auth.middleware({
  loginUrl: "/auth/sign-in",
  publicRoutes: ["/", "/auth/sign-in", "/legal/terms", "/legal/privacy", "/api/health", "/offline", "/manifest.webmanifest"],
});
export const config={matcher:["/dashboard/:path*","/legal/accept"]};
