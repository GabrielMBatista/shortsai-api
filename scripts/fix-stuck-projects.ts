/**
 * Script de Correção para Projetos Travados
 * 
 * Este script identifica e corrige projetos que ficaram travados no status 'generating'
 * quando todos os assets (image + audio) já foram concluídos, mas o video_status está
 * em 'draft' porque o projeto não gera vídeos.
 */

import { PrismaClient, SceneStatus, ProjectStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function fixStuckProjects() {
    console.log('🔍 Buscando projetos travados...');

    const projects = await prisma.project.findMany({
        where: {
            status: ProjectStatus.generating
        },
        include: {
            scenes: {
                where: { deleted_at: null },
                orderBy: { scene_number: 'asc' }
            }
        }
    });

    console.log(`📊 Encontrados ${projects.length} projetos em status 'generating'`);

    let fixedCount = 0;

    for (const project of projects) {
        // Verificar se está gerando vídeos
        const isGeneratingVideos = project.scenes.some((s: any) =>
            s.media_type === 'video' ||
            ['completed', 'processing', 'loading', 'queued', 'pending'].includes(s.video_status)
        );

        // Verificar se todas as cenas estão completas (considerando video apenas se necessário)
        const allScenesDone = project.scenes.every((s: any) => {
            const imageAndAudioDone =
                s.image_status === SceneStatus.completed &&
                s.audio_status === SceneStatus.completed;

            if (isGeneratingVideos) {
                return imageAndAudioDone && s.video_status === SceneStatus.completed;
            }
            return imageAndAudioDone;
        });

        const musicDone = !project.include_music ||
            project.bg_music_status === 'completed';

        // Se tudo está pronto, marcar como completo
        if (allScenesDone && musicDone) {
            console.log(`✅ Corrigindo projeto: ${project.id} (${project.topic})`);

            await prisma.project.update({
                where: { id: project.id },
                data: { status: ProjectStatus.completed }
            });

            fixedCount++;
        } else {
            // Verificar se há processos travados (processing/loading por muito tempo)
            const hasStuckProcesses = project.scenes.some((s: any) =>
                ['processing', 'loading'].includes(s.image_status) ||
                ['processing', 'loading'].includes(s.audio_status) ||
                (isGeneratingVideos && ['processing', 'loading'].includes(s.video_status))
            );

            if (hasStuckProcesses) {
                console.log(`⚠️  Projeto com processos potencialmente travados: ${project.id}`);
                console.log(`   Considere resetar manualmente ou aguardar timeout automático.`);
            }
        }
    }

    console.log(`\n✨ Correção concluída!`);
    console.log(`   📝 Total analisado: ${projects.length}`);
    console.log(`   🔧 Total corrigido: ${fixedCount}`);
}

fixStuckProjects()
    .then(() => {
        console.log('\n✅ Script finalizado com sucesso!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Erro ao executar script:', error);
        process.exit(1);
    })
    .finally(() => {
        prisma.$disconnect();
    });
