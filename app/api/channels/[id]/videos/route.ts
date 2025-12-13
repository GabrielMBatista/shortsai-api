import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: channelId } = await params;
        const { searchParams } = new URL(request.url);
        const accountId = searchParams.get('accountId');

        if (!accountId) {
            return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });
        }

        // 1. Fetch the Channel to get youtubeChannelId
        const channel = await prisma.channel.findUnique({
            where: { id: channelId },
            include: { account: true }
        });

        if (!channel) {
            return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
        }

        // Use the accountId from query param or fallback to channel's linked account
        // Ideally we should verify if the passed accountId matches or has access, but for now we trust the flow
        // The previous code fetched account by accountId anyway.

        // 2. Fetch the specific account to get credentials
        const account = await prisma.account.findUnique({
            where: {
                id: accountId,
                userId: session.user.id
            }
        });

        if (!account || !account.refresh_token) {
            return NextResponse.json({ error: 'Account not found or missing credentials' }, { status: 404 });
        }

        // 3. Setup Google Auth
        const authClient = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );

        authClient.setCredentials({
            refresh_token: account.refresh_token,
            access_token: account.access_token || undefined
        });

        const youtube = google.youtube({ version: 'v3', auth: authClient });

        // 4. Get Channel "Uploads" Playlist ID
        // Saves quota by asking only for contentDetails
        const channelRes = await youtube.channels.list({
            part: ['contentDetails'],
            id: [channel.youtubeChannelId] // Use the actual YouTube ID
        });

        const uploadsPlaylistId = channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

        if (!uploadsPlaylistId) {
            return NextResponse.json({ error: 'Could not find uploads playlist for this channel' }, { status: 404 });
        }

        // 4. Get Recent Videos from Uploads Playlist
        // Getting top 20 videos
        const playlistRes = await youtube.playlistItems.list({
            part: ['snippet', 'contentDetails'],
            playlistId: uploadsPlaylistId,
            maxResults: 20
        });

        const videoItems = playlistRes.data.items || [];
        const videoIds = videoItems.map(item => item.contentDetails?.videoId).filter(Boolean) as string[];

        if (videoIds.length === 0) {
            return NextResponse.json([]);
        }

        // 5. Get Detailed Stats for these videos (Views, Likes, Comments, Tags)
        const videosRes = await youtube.videos.list({
            part: ['snippet', 'statistics', 'contentDetails'],
            id: videoIds
        });

        const detailedVideos = videosRes.data.items || [];

        // 6. Map to clean format
        const mappedVideos = detailedVideos.map(video => ({
            id: video.id,
            title: video.snippet?.title,
            description: video.snippet?.description,
            publishedAt: video.snippet?.publishedAt,
            thumbnail: video.snippet?.thumbnails?.high?.url || video.snippet?.thumbnails?.default?.url,
            tags: video.snippet?.tags || [],
            duration: video.contentDetails?.duration, // ISO 8601 format (e.g., PT1M30S)
            stats: {
                views: parseInt(video.statistics?.viewCount || '0'),
                likes: parseInt(video.statistics?.likeCount || '0'),
                comments: parseInt(video.statistics?.commentCount || '0')
            },
            url: `https://youtube.com/watch?v=${video.id}`
        }));

        return NextResponse.json(mappedVideos);

    } catch (error: any) {
        console.error('Error fetching channel videos:', error);
        return NextResponse.json({
            error: 'Failed to fetch videos',
            details: error?.message
        }, { status: 500 });
    }
}
