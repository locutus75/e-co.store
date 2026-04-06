import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcrypt"
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { 
            userRoles: { 
              include: { 
                role: true
              } 
            } 
          }
        });
        if (!user) return null;
        
        const isMatch = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isMatch) return null;

        const roles = user.userRoles.map((ur: any) => ur.role.name);
        
        return {
          id: user.id,
          email: user.email,
          roles: roles
        } as any;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.roles = (user as any).roles;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).roles = token.roles as string[];
      }
      return session;
    }
  },
  pages: {
    signIn: '/login'
  },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
}
