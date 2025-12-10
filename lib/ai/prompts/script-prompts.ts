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
        
        SAFETY & VISUAL GUIDELINES (CRITICAL):
        - Visual descriptions must be SAFE FOR WORK (PG-13).
        - AVOID: Violence, gore, blood, weapons, explicit content, real politicians/celebrities, or overly realistic depictions of suffering.
        - Use stylistic keywords like "Cinematic lighting", "3D render", "Abstract", "Digital Art" to avoid triggering realism filters if the topic is sensitive.
        - Focus on atmosphere, lighting, and composition rather than specific restricted actions.

        ========================================
        🔥 CRITICAL METADATA REQUIREMENTS (MANDATORY - DO NOT SKIP):
        ========================================
        YOU MUST GENERATE ALL OF THE FOLLOWING FIELDS. MISSING ANY FIELD WILL CAUSE SYSTEM FAILURE.
        Language for metadata: ${language}

        1. **videoTitle** (MANDATORY):
           - Structure: [Gatilho/Trigger] + [Afirmação Forte/Strong Statement] + [Âncora do Tema/Topic Anchor]
           - Max 60 characters
           - Must include main keyword
           - Emotional and direct
           - Example: "🚀 Isso Mudou Tudo! | ${topic.split(' ').slice(0, 3).join(' ')}"

        2. **videoDescription** (MANDATORY):
           - 1-4 lines ONLY
           - Structure: Emotional hook → Essence → Single CTA
           - Must end with CTA (e.g., "Comente 'SIM'", "Comment 'YES'")
           - Example: "Descobri isso e minha vida nunca mais foi a mesma. Veja até o final. 👉 Comente 'INCRÍVEL'"

        3. **shortsHashtags** (MANDATORY ARRAY - MINIMUM 8, MAXIMUM 12):
           - Format: ALL LOWERCASE, include # symbol
           - Mix: 3 generic + 6 specific + 3 niche
           - Priority: Content keywords
           - Example: ["#shorts", "#${topic.split(' ')[0].toLowerCase()}", "#viral", "#fyp", "#explorepage", "#trending", "#${language.toLowerCase()}", "#reels"]

        4. **tiktokText** (MANDATORY):
           - EXACTLY 1 sentence
           - Focus: Emotion or immediate identification
           - NO external links, NO requests to leave platform
           - Example: "Isso mudou minha perspectiva para sempre 🤯"

        5. **tiktokHashtags** (MANDATORY ARRAY - EXACTLY 5):
           - Structure: 1 broad + 3 specific + 1 community
           - Goal: ForYou page delivery
           - Example: ["#fyp", "#${topic.split(' ')[0].toLowerCase()}", "#viral", "#foryou", "#trending"]

        ========================================

        Output ONLY valid JSON. No markdown blocks. No explanations.
        USE CAMELCASE FOR ALL KEYS.
        
        REQUIRED JSON STRUCTURE (ALL FIELDS MANDATORY):
        {
            "videoTitle": "🚀 [Emotional Trigger] | [Core Message]",
            "videoDescription": "Hook emocional... Essência do conteúdo... CTA: Comente 'X' 👇",
            "shortsHashtags": ["#shorts", "#viral", "#fyp", "#topic1", "#topic2", "#topic3", "#niche1", "#niche2"],
            "tiktokText": "Frase curta e impactante que gera emoção.",
            "tiktokHashtags": ["#fyp", "#viral", "#trending", "#specific", "#community"],
            "scenes": [
                { "sceneNumber": 1, "visualDescription": "Detailed visual prompt for AI image generator", "narration": "Voiceover text", "durationSeconds": 5 }
            ]
        }
        
        REMINDER: IF YOU OMIT shortsHashtags OR tiktokHashtags, THE SYSTEM WILL FAIL. ALWAYS INCLUDE BOTH ARRAYS WITH AT LEAST THE MINIMUM REQUIRED ITEMS.
        `;
