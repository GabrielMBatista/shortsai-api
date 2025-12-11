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
    // Allow linking different accounts to the same user if needed (though we want multiple connected accounts, not just login methods)
    // IMPORTANT: For linking multiple Google accounts to ONE user session, the adapter handles it if we are already logged in while connecting.
    // However, if the issue is "reloading" without action, it might be the prompt param not taking effect or the session cookies.

    // Enabling this to ensure we don't get 'OAuthAccountNotLinked' errors if emails match

    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
                params: {
                    scope: "openid email profile https://www.googleapis.com/auth/youtube.readonly",
                    access_type: "offline",
                    prompt: "consent select_account",
                }
            }
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
        async signIn({ user, account, profile }) {
            // Explicitly update the account tokens in the database if they are provided.
            // This fixes issues where re-connecting doesn't automatically update the refresh_token in some Prisma Adapter versions.
            if (account?.provider === "google" && account.refresh_token) {
                try {
                    await prisma.account.update({
                        where: {
                            provider_providerAccountId: {
                                provider: "google",
                                providerAccountId: account.providerAccountId
                            }
                        },
                        data: {
                            refresh_token: account.refresh_token,
                            access_token: account.access_token,
                            expires_at: account.expires_at,
                            id_token: account.id_token,
                            scope: account.scope,
                            updatedAt: new Date(),
                        }
                    });
                    console.log("Auth: Manually updated Google account tokens for providerAccountId:", account.providerAccountId);
                } catch (error) {
                    // Account might not exist yet (first sign in), which is fine, the adapter will create it.
                    console.log("Auth: Skipping manual update (account might be new or not found)", error);
                }
            }
            return true;
        },
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
            // Allow explicit frontend URL if hardcoded
            else if (url.startsWith("https://shorts-ai-studio.vercel.app")) return url
            return baseUrl
        },
    },
    pages: {
        signIn: "/api/auth/redirect",
        error: "/api/auth/redirect",
        signOut: "/api/auth/redirect",
    },
})
