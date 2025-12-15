import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { auth } from '@/lib/auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/services/google-drive';
import { createRequestLogger } from '@/lib/logger';
import { handleError } from '@/lib/middleware/error-handler';
import { UnauthorizedError, ExternalApiError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/channels
 * Retrieve all YouTube channels for the authenticated user across all connected Google accounts
 * 
 * @param request - Next.js request object
 * @returns JSON response with array of channels
 */
export async function GET(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || randomUUID();
    const startTime = Date.now();

    try {
        const session = await auth();
        if (!session?.user?.id) {
            throw new UnauthorizedError();
        }

        const reqLogger = createRequestLogger(requestId, session.user.id);
        reqLogger.info('Fetching user channels from connected Google accounts');

        const user_id = session.user.id;

        const accounts = await prisma.account.findMany({
            where: {
                userId: user_id,
                provider: {
                    in: ['google', 'google-channels']
                }
            }
        });

        reqLogger.debug(
            { accountCount: accounts.length },
            'Found connected Google accounts'
        );

        const channelsPromises = accounts.map(async (acc) => {
            try {
                // Initialize Auth for this specific account
                if (!acc.refresh_token) {
                    reqLogger.warn(
                        { accountId: acc.id },
                        'Account missing refresh token'
                    );
                    throw new Error('Missing refresh token');
                }

                const authClient = new google.auth.OAuth2(
                    process.env.GOOGLE_CLIENT_ID,
                    process.env.GOOGLE_CLIENT_SECRET,
                    process.env.GOOGLE_REDIRECT_URI
                );

                authClient.setCredentials({
                    refresh_token: acc.refresh_token,
                    access_token: acc.access_token || undefined
                });

                const youtube = google.youtube({ version: 'v3', auth: authClient });
                const oauth2 = google.oauth2({ version: 'v2', auth: authClient });

                // Fetch channel data and user info in parallel
                const [channelsResponse, userResponse] = await Promise.all([
                    youtube.channels.list({
                        part: ['snippet', 'contentDetails', 'statistics'],
                        mine: true
                    }),
                    oauth2.userinfo.get().catch(() => ({ data: { email: undefined } }))
                ]);

                const items = channelsResponse.data.items || [];
                const accountEmail = userResponse.data.email;

                reqLogger.debug(
                    { accountId: acc.id, channelCount: items.length },
                    'Successfully fetched channels for account'
                );

                // Return all channels found for this account
                return items.map(item => ({
                    id: item.id,
                    accountId: acc.id,
                    name: item.snippet?.title || 'Unknown Channel',
                    email: accountEmail,
                    thumbnail: item.snippet?.thumbnails?.default?.url,
                    statistics: item.statistics,
                    provider: 'youtube',
                    lastSync: acc.updatedAt,
                    status: 'active'
                }));

            } catch (err: any) {
                reqLogger.warn(
                    {
                        accountId: acc.id,
                        error: err.message,
                        code: err.code
                    },
                    'Failed to fetch channels for account'
                );

                const errorMessage = err?.message || 'Unknown Error';
                let friendlyName = 'Google Account (Error)';

                // Categorize errors for better UX
                if (errorMessage.includes('insufficient authentication scopes') ||
                    errorMessage.includes('403')) {
                    friendlyName = 'Google Account (Needs Permissions)';
                } else if (errorMessage.includes('YouTube Data API v3 has not been used') ||
                    errorMessage.includes('accessNotConfigured')) {
                    friendlyName = 'YouTube API Disabled';
                } else if (errorMessage.includes('Missing refresh token')) {
                    friendlyName = 'Reconnect Required';
                } else {
                    friendlyName = `Google Account (${errorMessage.substring(0, 30)}...)`;
                }

                // Return fallback channel representation
                return [{
                    id: acc.providerAccountId,
                    accountId: acc.id,
                    name: friendlyName,
                    provider: 'google',
                    lastSync: acc.updatedAt,
                    status: 'error',
                    errorMessage: errorMessage
                }];
            }
        });

        const channelsNested = await Promise.all(channelsPromises);
        const channels = channelsNested.flat();

        const duration = Date.now() - startTime;
        reqLogger.info(
            {
                totalChannels: channels.length,
                activeChannels: channels.filter(c => c.status === 'active').length,
                errorChannels: channels.filter(c => c.status === 'error').length,
                duration
            },
            `Channels fetched successfully in ${duration}ms`
        );

        return NextResponse.json(channels, {
            headers: { 'X-Request-ID': requestId },
        });
    } catch (error) {
        return handleError(error, requestId);
    }
}
