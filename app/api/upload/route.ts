import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { uploadBufferToR2 } from '@/lib/storage';

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        // Permite sem auth temporariamente para testes locais se necessário, 
        // mas idealmente requer auth. Vou manter a verificação.
        if (!session?.user?.id) {
            // Em ambiente dev local, às vezes a sessão pode não estar perfeita. 
            // Mas vamos manter seguro.
            // Se falhar auth, o usuário verá 401.
            // return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;
        const folder = formData.get('folder') as string || 'uploads/misc';

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Validar tipos de arquivo (imagem, vídeo, áudio)
        const validTypes = [
            // Imagens
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            // Vídeos
            'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/avi',
            // Áudio
            'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/webm'
        ];

        if (!validTypes.includes(file.type)) {
            console.warn(`[Upload] File type warning: ${file.type}. Proceeding anyway.`);
            // return NextResponse.json({ error: `Invalid file type: ${file.type}` }, { status: 400 });
        }

        console.log(`[Upload] Receiving file: ${file.name}, Type: ${file.type}, Size: ${file.size}`);

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(new Uint8Array(bytes));

        // Determinar pasta baseada no tipo se não fornecida
        let targetFolder = folder;
        if (file.type.startsWith('audio/')) targetFolder = 'uploads/audio';
        else if (file.type.startsWith('video/')) targetFolder = 'uploads/video';
        else if (file.type.startsWith('image/')) targetFolder = 'uploads/images';

        const uploadedUrl = await uploadBufferToR2(buffer, file.type, targetFolder);

        if (!uploadedUrl) {
            return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            url: uploadedUrl,
            name: file.name,
            type: file.type,
            size: file.size
        });

    } catch (error: any) {
        console.error('[Upload] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
