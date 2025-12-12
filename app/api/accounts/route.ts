import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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
                // We might want to store/return email if we had it, but standard NextAuth Account doesn't always have it in root.
                // Usually it's in the User model, but for linked accounts, the email is in the Profile or not stored unless we extended schema.
                // For now, returning ID is enough to trigger discovery which returns the email.
            }
        });

        // If we want to show emails, we might need to fetch them from Google or store them in Account.
        // But discoverChannels returns the email. So the flow: Pick Account (Label: "Google Account connected on [Date]") -> Discover -> See Email.
        // Better: Discover PREVIEWS the email.

        return NextResponse.json({ accounts });
    } catch (error) {
        console.error('Error fetching accounts:', error);
        return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
    }
}
