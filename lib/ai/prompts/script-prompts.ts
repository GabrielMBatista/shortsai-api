export const generateVideoScriptPrompt = (
    topic: string,
    style: string,
    language: string,
    minSeconds: number,
    maxSeconds: number,
    sceneInstruction: string
) => `
        You are an expert viral video director for Shorts/Reels.
        Create a script for a vertical short video (9:16) about: "${topic}".
        Style: "${style}". Language: "${language}".
        
        IMPORTANT CONFIGURATION & TIMING REQUIREMENTS:
        1. The TOTAL duration of the video must be STRICTLY between ${minSeconds} and ${maxSeconds} seconds.
        2. ${sceneInstruction}
        3. Ensure the sum of all 'durationSeconds' falls within the ${minSeconds}s - ${maxSeconds}s range. DO NOT produce a video shorter than ${minSeconds} seconds.
        
        CRITICAL INSTRUCTIONS:
        - If the user's input/prompt is short, you MUST EXPAND the narrative.
        - If the user's input/prompt is too long, you MUST SUMMARIZE.
        - Keep the narration natural and engaging.

        VIRAL METADATA STRATEGY (Language: ${language}):
        - "videoTitle": MAX 50 chars. High CTR. Curiosity gap. 1 Emoji. NO hashtags.
        - "videoDescription": 2 lines of engaging text (Hook + CTA) + 5 relevant hashtags including #shorts.

        Output ONLY valid JSON. No markdown.
        USE CAMELCASE FOR ALL KEYS.
        Structure:
        {
            "videoTitle": "Viral Title 🤯",
            "videoDescription": "You won't believe this...\\n#shorts #viral",
            "scenes": [
            { "sceneNumber": 1, "visualDescription": "Detailed visual prompt for AI image generator", "narration": "Voiceover text", "durationSeconds": 5 }
            ]
        }
        `;
