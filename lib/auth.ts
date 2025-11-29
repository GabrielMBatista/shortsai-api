import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"

console.log("Auth Init - Env Vars Check:", {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? "Set" : "Missing",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? "Set" : "Missing",
    AUTH_SECRET: process.env.AUTH_SECRET ? "Set" : "Missing",
    AUTH_URL: process.env.AUTH_URL,
});

export const { handlers, signIn, signOut, auth } = NextAuth({
    adapter: PrismaAdapter(prisma),
    trustHost: true,
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }),
    ],
    secret: process.env.AUTH_SECRET,
    debug: true, // Force debug
    events: {
        createUser: async ({ user }) => {
            const { broadcastAdminUpdate } = await import("@/lib/sse/sse-service");
            broadcastAdminUpdate('USER_REGISTERED', user);
        }
    },
    callbacks: {
        async session({ session, user }) {
            console.log("Auth Debug - Env Vars:", {
                hasClientId: !!process.env.GOOGLE_CLIENT_ID,
                hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
                hasAuthSecret: !!process.env.AUTH_SECRET,
                clientIdPrefix: process.env.GOOGLE_CLIENT_ID?.substring(0, 5)
            });
            if (session.user) {
                session.user.id = user.id
                // Add other custom fields from user to session if needed
                // session.user.role = user.role
            }
            return session
        },
        async redirect({ url, baseUrl }) {
            // Allows relative callback URLs
            if (url.startsWith("/")) return `${baseUrl}${url}`
            // Allows callback URLs on the same origin
            else if (new URL(url).origin === baseUrl) return url
            // Allows callback URLs to localhost:3000 (Frontend)
            else if (url.startsWith("http://localhost:3000")) return url
            // Allows callback URLs to production domain (Dynamic)
            else if (process.env.NEXT_PUBLIC_APP_URL && url.startsWith(process.env.NEXT_PUBLIC_APP_URL)) return url
            return baseUrl
        },
    },
    pages: {
        signIn: "/api/auth/redirect",
        error: "/api/auth/redirect",
        signOut: "/api/auth/redirect",
    },
})
