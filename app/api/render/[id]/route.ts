
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const QUEUE_PATH = process.env.QUEUE_PATH || path.join(process.cwd(), 'queue.json');

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const params = await context.params;
        const { id } = params;

        if (!fs.existsSync(QUEUE_PATH)) {
            return NextResponse.json({ error: 'Queue empty' }, { status: 404 });
        }

        const fileContent = fs.readFileSync(QUEUE_PATH, 'utf-8');
        let queue = [];
        try {
            queue = JSON.parse(fileContent);
        } catch (e) {
            return NextResponse.json({ error: 'Queue invalid' }, { status: 500 });
        }

        const job = queue.find((j: any) => j.id === id);

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        return NextResponse.json(job);

    } catch (e: any) {
        return NextResponse.json({ error: 'Server error: ' + e.message }, { status: 500 });
    }
}
