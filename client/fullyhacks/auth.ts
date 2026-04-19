import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  providers: [
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile",
        },
      },
    }),
  ],
  callbacks: {
    /**
     * After Google signs the user in, exchange the Google ID token for our
     * own backend JWT and store it in the NextAuth token so it's available
     * in the session.
     */
    async jwt({ token, account }) {
      if (account?.id_token) {
        try {
          const res = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id_token: account.id_token }),
          });
          if (res.ok) {
            const data = await res.json();
            token.backendToken = data.access_token as string;
            token.backendUser  = data.user;
          }
        } catch (err) {
          console.error("[auth] Backend login failed:", err);
        }
      }
      return token;
    },

    async session({ session, token }) {
      return {
        ...session,
        backendToken: token.backendToken as string | undefined,
        backendUser:  token.backendUser  as Record<string, string> | undefined,
      };
    },
  },
  pages: {
    signIn: "/login",
  },
});
