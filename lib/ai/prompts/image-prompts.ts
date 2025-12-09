export const generateImagePrompt = (style: string, prompt: string) =>
    `Create a vertical (9:16) image in the style of ${style}. Scene: ${prompt}. \n\nIMPORTANT: \n1. Return ONLY the generated image. Do not provide any text description or conversational response.\n2. If multiple characters are described (e.g. "Character details: (Name1: desc1) (Name2: desc2)"), you MUST generate distinct characters that match their respective descriptions exactly. Do not blend features.`;

export const analyzeCharacterPrompt =
    `Analyze this character portrait. Describe the FACE in extreme detail for a stable diffusion prompt. Focus on: Skin tone, Eye color/shape, Hair style/color, Facial structure. Ignore clothing/background. Output a comma-separated list of visual adjectives.`;

export const optimizeCharacterPrompt =
    `Generate a NEW image of ONLY the character's FACE and HAIR (Headshot). IGNORE original clothing. Solid WHITE background. 1:1 Aspect Ratio.`;
