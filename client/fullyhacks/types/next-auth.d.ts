import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    backendToken?: string;
    backendUser?: {
      id:         string;
      email:      string;
      name:       string;
      avatar_url?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    backendToken?: string;
    backendUser?:  Record<string, string>;
  }
}
