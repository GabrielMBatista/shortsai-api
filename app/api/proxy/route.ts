import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    try {
        const decodedUrl = decodeURIComponent(url);
        // Double decode protection if needed, but usually once is enough for Next.js searchParams which auto-decodes once? 
        // Actually req.nextUrl.searchParams.get() ALREADY decodes standard URI components. 
        // If we sent it encoded, get() returns the decoded version. 
        // If we passed a URL as a param, it should be fine.
        // Let's log the url to be sure (if we could see logs).
        const response = await fetch(decodedUrl);

        if (!response.ok) {
            return NextResponse.json({ error: `Failed to fetch resource: ${response.statusText}` }, { status: response.status });
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const arrayBuffer = await response.arrayBuffer();

        return new NextResponse(arrayBuffer, {
            headers: {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=31536000, immutable'
            }
        });

    } catch (error) {
        console.error('Proxy error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
