import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

/**
 * FFmpeg Utility Functions
 * Wrapper para comandos FFmpeg com error handling e progress tracking
 */

export class FFmpegService {
    /**
     * Test if FFmpeg is available
     */
    static async testFFmpeg(): Promise<boolean> {
        try {
            await execAsync('ffmpeg -version');
            return true;
        } catch (error) {
            console.error('[FFmpeg] Not found in PATH:', error);
            return false;
        }
    }

    /**
     * Get video metadata
     */
    static async getVideoMetadata(filePath: string): Promise<{
        duration: number;
        width: number;
        height: number;
        fps: number;
    }> {
        const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,duration -of json "${filePath}"`;
        const { stdout } = await execAsync(cmd);
        const data = JSON.parse(stdout);
        const stream = data.streams[0];

        // Parse framerate (e.g., "30/1" -> 30)
        const [num, den] = stream.r_frame_rate.split('/').map(Number);
        const fps = num / den;

        return {
            duration: parseFloat(stream.duration || '0'),
            width: stream.width,
            height: stream.height,
            fps
        };
    }

    /**
     * Execute FFmpeg command with progress tracking
     */
    static async executeWithProgress(
        command: string,
        totalDuration: number,
        onProgress?: (percent: number) => void
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const childProcess = exec(command);

            let stderrData = '';

            childProcess.stderr?.on('data', (data: string) => {
                stderrData += data;

                // Parse FFmpeg progress: "time=00:00:05.23"
                const timeMatch = data.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
                if (timeMatch && onProgress) {
                    const hours = parseInt(timeMatch[1]);
                    const minutes = parseInt(timeMatch[2]);
                    const seconds = parseFloat(timeMatch[3]);
                    const currentTime = hours * 3600 + minutes * 60 + seconds;
                    const percent = Math.min((currentTime / totalDuration) * 100, 99);
                    onProgress(percent);
                }
            });

            childProcess.on('close', (code) => {
                if (code === 0) {
                    onProgress?.(100);
                    resolve();
                } else {
                    reject(new Error(`FFmpeg exited with code ${code}\n${stderrData}`));
                }
            });

            childProcess.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * Download file from URL to temp directory
     */
    static async downloadFile(url: string, destPath: string): Promise<void> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to download ${url}: ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        await fs.writeFile(destPath, Buffer.from(buffer));
    }

    /**
     * Create temporary working directory
     */
    static async createTempDir(prefix: string): Promise<string> {
        const tmpDir = path.join('/tmp', `render-${prefix}-${Date.now()}`);
        await fs.mkdir(tmpDir, { recursive: true });
        return tmpDir;
    }

    /**
     * Cleanup temporary directory
     */
    static async cleanupTempDir(dirPath: string): Promise<void> {
        try {
            await fs.rm(dirPath, { recursive: true, force: true });
        } catch (error) {
            console.warn(`[FFmpeg] Failed to cleanup ${dirPath}:`, error);
        }
    }

    /**
     * Convert time in seconds to FFmpeg timestamp format (HH:MM:SS.mmm)
     */
    static formatTimestamp(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`;
    }
}
