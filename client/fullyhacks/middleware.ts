import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isAuthenticated = !!req.auth;
  const { pathname }    = req.nextUrl;

  const isLoginPage = pathname === "/login";
  const isApiRoute  = pathname.startsWith("/api");

  // Unauthenticated user tries to access a protected page → send to /login
  if (!isAuthenticated && !isLoginPage && !isApiRoute) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Authenticated user hits /login → send to /setup
  if (isAuthenticated && isLoginPage) {
    return NextResponse.redirect(new URL("/", req.url));
  }
});

export const config = {
  // Run on all routes except static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg).*)"],
};
