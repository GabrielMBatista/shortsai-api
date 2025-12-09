export const refineAnimationPrompt = (prompt: string) =>
    `Create a concise (under 40 words) cinematic animation prompt based on this visual description. Focus on movement, camera angle and atmosphere. 
    IMPORTANT: Ensure the output is completely safe and strictly adheres to safety guidelines. 
    - NO children or minors.
    - NO prominent real-world people or celebrities.
    - NO violence, gore, weapons, or dangerous activities.
    - NO sexual content, nudity, or toxic language.
    - NO personally identifiable information.
    - REPLACE names of religious figures (e.g. Jesus) or famous people with generic visual descriptions (e.g. 'a bearded man in robes').
    - Ensure the subject stays in frame and does NOT turn their back unless explicitly requested.
    - Do NOT add people, characters, or animals if they are not explicitly described in the input.
    Output ONLY the prompt: "${prompt}"`;

export const generateVideoPrompt = (animationPrompt: string) =>
    `Cinematic slow motion animation of this image. Ambient movement, high quality video background. ${animationPrompt}`;
