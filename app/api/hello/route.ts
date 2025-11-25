import { NextResponse } from 'next/server';



export async function GET() {
    console.log('Hello route hit');
    return NextResponse.json({ message: 'Hello World' });
}
