import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

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
                userId: user_id, // Note: In schema it is userId, mapped to user_id? Let's check prisma schema again.
                provider: 'google'
            },
            select: {
                id: true,
                provider: true,
                providerAccountId: true, // Google Channel ID usually comes from here or extra metadata
                drivePageToken: true,
                driveChannelId: true,
                driveChannelExpiration: true,
                updatedAt: true
            }
        });

        // Map to a friendlier format if needed
        const mappedAccounts = accounts.map(acc => ({
            id: acc.id,
            name: acc.providerAccountId, // For now, we don't store email separately in Account unless we fetch via API. 
            // In NextAuth account, providerAccountId is usually the Google Sub/ID.
            // Ideally we should have a way to get the email (maybe store it in User if linked?).
            // For now let's just return what we have.
            provider: acc.provider,
            lastSync: acc.updatedAt,
            status: acc.driveChannelExpiration && new Date(acc.driveChannelExpiration) > new Date() ? 'active' : 'inactive'
        }));

        return NextResponse.json(mappedAccounts);
    } catch (error: any) {
        console.error('Error fetching channels:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
