export type WorkflowAction =
    | 'generate_all'
    | 'generate_image'
    | 'generate_all_images'
    | 'regenerate_image'
    | 'generate_audio'
    | 'generate_all_audio'
    | 'regenerate_audio'
    | 'generate_music'
    | 'generate_video'
    | 'regenerate_video'
    | 'cancel'
    | 'pause'
    | 'resume'
    | 'skip_scene';

export interface WorkflowCommand {
    projectId: string;
    sceneId?: string;
    action: WorkflowAction;
    force?: boolean;
    apiKeys?: {
        gemini?: string;
        elevenlabs?: string;
        suno?: string;
    };
}

export type WorkflowTaskParams =
    | { prompt: string; width: number; height: number }
    | { text: string; voice: string; provider: string }
    | { prompt: string; duration: number }; // Music params example

export interface WorkflowTask {
    id: string; // Unique task ID
    projectId: string;
    sceneId?: string;
    action: 'generate_image' | 'generate_audio' | 'generate_music' | 'generate_video';
    params: WorkflowTaskParams;
    status: 'pending' | 'dispatched' | 'completed' | 'failed';
    createdAt: Date;
    apiKeys?: {
        gemini?: string;
        elevenlabs?: string;
        suno?: string;
    };
}
