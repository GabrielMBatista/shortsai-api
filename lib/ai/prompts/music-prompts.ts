export const generateMusicPromptRaw = (topic: string, style: string) =>
    `Create a text-to-audio prompt for Suno AI. Topic: "${topic}". Style: "${style}". Output: Max 25 words, include "instrumental, no vocals".`;
