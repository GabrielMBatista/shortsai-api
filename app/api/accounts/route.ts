import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const accounts = await prisma.account.findMany({
            where: {
                userId: session.user.id,
                provider: 'google'
            },
            select: {
                id: true,
                provider: true,
                providerAccountId: true,
                refresh_token: true,
                access_token: true
            }
        });

        const accountsWithProfile = await Promise.all(accounts.map(async (account) => {
            let email = null;
            let name = null;
            let avatar = null;

            if (account.provider === 'google' && account.refresh_token) {
                try {
                    const authClient = new google.auth.OAuth2(
                        process.env.GOOGLE_CLIENT_ID,
                        process.env.GOOGLE_CLIENT_SECRET
                    );

                    authClient.setCredentials({
                        refresh_token: account.refresh_token,
                        access_token: account.access_token || undefined
                    });

                    const oauth2 = google.oauth2({ version: 'v2', auth: authClient });
                    const userInfo = await oauth2.userinfo.get();

                    email = userInfo.data.email;
                    name = userInfo.data.name;
                    avatar = userInfo.data.picture;

                } catch (err) {
                    console.warn(`Failed to fetch profile for account ${account.id}:`, err);
                }
            }

            return {
                id: account.id,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                email,
                name,
                avatar
            };
        }));

        return NextResponse.json({ accounts: accountsWithProfile });
    } catch (error) {
        console.error('Error fetching accounts:', error);
        return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
    }
}
