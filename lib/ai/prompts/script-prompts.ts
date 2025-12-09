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
        
        1. **videoTitle** (Shorts/Reels/TikTok):
           - Structure: [Trigger] + [Strong Statement] + [Topic Anchor]
           - Characteristics: Short, direct, emotional. Contains a strong question or statement. Includes a central keyword.

        2. **videoDescription** (YouTube Shorts):
           - Length: 1-4 lines.
           - Structure: Emotional phrase linked to content -> Explain essence -> CTA (e.g., "Comment 'X'").
        
        3. **shortsHashtags** (YouTube Shorts):
           - Quantity: 8 to 12 hashtags.
           - Format: All lowercase. Mix generic and specific.
           - Priority: Content keywords.

        4. **tiktokText** (TikTok Post Text):
           - Length: 1 sentence.
           - Focus: Emotion/identification. Retention over search. No links.

        5. **tiktokHashtags** (TikTok):
           - Quantity: Max 5 hashtags.
           - Structure: 1 broad + 3 specific + 1 community.
           - Goal: ForYou delivery.

        6. **Consistency**:
           - Maintain consistent title/hashtag structure.


        Output ONLY valid JSON. No markdown.
        USE CAMELCASE FOR ALL KEYS.
        Structure:
        {
            "videoTitle": "State of the art Title 🤯",
            "videoDescription": "Emotional hook... Essence... CTA: Comment 'YES'",
            "shortsHashtags": ["#shorts", "#topic", ...],
            "tiktokText": "This changed my life forever.",
            "tiktokHashtags": ["#fyp", "#specific", ...],
            "scenes": [
                { "sceneNumber": 1, "visualDescription": "Detailed visual prompt for AI image generator", "narration": "Voiceover text", "durationSeconds": 5 }
            ]
        }
        `;
