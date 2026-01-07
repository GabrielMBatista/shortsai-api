import { RenderScene, WordTiming } from './types';
import { FFmpegService } from './ffmpeg-service';

/**
 * ASS Subtitle Generator
 * Generates .ass subtitle files with precise word-level timing
 * Matches frontend styling: Inter Bold, yellow active, white inactive
 */

export class SubtitleGenerator {
    /**
     * Generate ASS subtitle file content
     */
    static generate(scenes: RenderScene[]): string {
        const header = this.generateHeader();
        const events = this.generateEvents(scenes);

        return header + events;
    }

    private static generateHeader(): string {
        return `[Script Info]
Title: Shorts AI Video
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Active,Inter,54,&H15CCFA,&HFFFFFFFF,&H80000000,&H80000000,-1,0,0,0,110,110,0,0,1,0,4,2,10,10,250,1
Style: Inactive,Inter,54,&H59FFFFFF,&HFFFFFFFF,&H80000000,&H80000000,-1,0,0,0,100,100,0,0,1,0,4,2,10,10,250,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
    }

    private static generateEvents(scenes: RenderScene[]): string {
        let events = '';
        let timeOffset = 0;

        scenes.forEach((scene, sceneIdx) => {
            const timings = scene.wordTimings || this.generateFallbackTimings(scene);

            if (timings.length === 0) {
                timeOffset += scene.durationSeconds;
                return;
            }

            // Estratégia: Mostrar 7 palavras por vez (palavra-a-palavra highlight)
            const WORDS_PER_PAGE = 7;
            const totalPages = Math.ceil(timings.length / WORDS_PER_PAGE);

            for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
                const start = pageIdx * WORDS_PER_PAGE;
                const end = Math.min(start + WORDS_PER_PAGE, timings.length);
                const pageWords = timings.slice(start, end);

                // Página inteira aparece e desaparece junta
                const pageStart = timeOffset + pageWords[0].start;
                const pageEnd = timeOffset + pageWords[pageWords.length - 1].end;

                // Para cada palavra na página
                pageWords.forEach((timing, wordIdx) => {
                    const absIndex = start + wordIdx;
                    const wordStart = timeOffset + timing.start;
                    const wordEnd = timeOffset + timing.end;

                    // Construir linha com todas as palavras (espaçamento correto)
                    const wordsText = pageWords.map((t, i) => {
                        if (i === wordIdx) {
                            // Palavra ativa: amarelo + escala 110%
                            return `{\\c&H15CCFA&\\fscx110\\fscy110}${t.word}`;
                        } else {
                            // Palavra inativa: branco 35% opacity
                            return `{\\c&H59FFFFFF&\\fscx100\\fscy100}${t.word}`;
                        }
                    }).join(' ');

                    events += `Dialogue: 0,${this.formatTime(wordStart)},${this.formatTime(wordEnd)},Active,,0,0,0,,${wordsText}\n`;
                });
            }

            timeOffset += scene.durationSeconds;
        });

        return events;
    }

    /**
     * Generate fallback word timings if not provided
     */
    private static generateFallbackTimings(scene: RenderScene): WordTiming[] {
        const words = scene.narration.split(/\s+/).filter(w => w.length > 0);
        if (words.length === 0) return [];

        const avgDuration = scene.durationSeconds / words.length;

        return words.map((word, idx) => ({
            word,
            start: idx * avgDuration,
            end: (idx + 1) * avgDuration
        }));
    }

    /**
     * Format seconds to ASS timestamp (H:MM:SS.cc)
     */
    private static formatTime(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        const centiseconds = Math.floor((secs % 1) * 100);
        const wholeSecs = Math.floor(secs);

        return `${hours}:${minutes.toString().padStart(2, '0')}:${wholeSecs.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
    }
}
