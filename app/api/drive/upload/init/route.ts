import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getGoogleAuth, initiateResumableUpload } from '@/lib/services/google-drive';
import { z } from 'zod';

const initUploadSchema = z.object({
    fileName: z.string().min(1),
    mimeType: z.string().default('video/mp4'),
});

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { fileName, mimeType } = initUploadSchema.parse(body);

        const googleAuth = await getGoogleAuth(session.user.id);
        const uploadUrl = await initiateResumableUpload(googleAuth, fileName, mimeType);

        if (!uploadUrl) {
            return NextResponse.json({ error: 'Failed to initiate upload session' }, { status: 502 });
        }

        return NextResponse.json({ uploadUrl });
    } catch (error: any) {
        console.error('Drive Upload Init Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
