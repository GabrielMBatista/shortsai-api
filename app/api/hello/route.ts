import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    console.log('Hello route hit');
    return NextResponse.json({ message: 'Hello World' });
}
