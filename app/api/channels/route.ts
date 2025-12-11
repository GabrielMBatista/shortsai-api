import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/services/google-drive';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user_id = session.user.id;

        const accounts = await prisma.account.findMany({
            where: {
                userId: user_id,
                provider: 'google'
            }
        });

        const channelsPromises = accounts.map(async (acc) => {
            try {
                // Initialize Auth Manually for this specific account
                if (!acc.refresh_token) {
                    throw new Error('Missing refresh token');
                }

                const authClient = new google.auth.OAuth2(
                    process.env.GOOGLE_CLIENT_ID,
                    process.env.GOOGLE_CLIENT_SECRET,
                    process.env.GOOGLE_REDIRECT_URI
                );

                authClient.setCredentials({
                    refresh_token: acc.refresh_token,
                    access_token: acc.access_token || undefined // optional
                });

                const youtube = google.youtube({ version: 'v3', auth: authClient });

                // Fetch User's Channels
                const response = await youtube.channels.list({
                    part: ['snippet', 'contentDetails', 'statistics'],
                    mine: true
                });

                const items = response.data.items || [];

                // Return all channels found for this account
                return items.map(item => ({
                    id: item.id, // YouTube Channel ID
                    accountId: acc.id, // Internal Account ID
                    name: item.snippet?.title || 'Unknown Channel',
                    thumbnail: item.snippet?.thumbnails?.default?.url,
                    statistics: item.statistics,
                    provider: 'youtube', // explicit for UI
                    lastSync: acc.updatedAt,
                    status: 'active' // If API call worked, it's active
                }));

            } catch (err: any) {
                console.error(`Failed to fetch channels for account ${acc.id}:`, err);
                const errorMessage = err?.message || 'Unknown Error';
                const isScopeError = errorMessage.includes('insufficient authentication scopes') || errorMessage.includes('403');

                // Return a fallback if API fails but account exists
                return [{
                    id: acc.providerAccountId,
                    accountId: acc.id,
                    name: `Google Account (${isScopeError ? 'Needs Re-Auth' : errorMessage})`,
                    provider: 'google',
                    lastSync: acc.updatedAt,
                    status: 'error'
                }];
            }
        });

        const channelsNested = await Promise.all(channelsPromises);
        const channels = channelsNested.flat();

        return NextResponse.json(channels);
    } catch (error: any) {
        console.error('Error fetching channels:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
