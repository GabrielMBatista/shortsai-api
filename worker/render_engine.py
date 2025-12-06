
import os
import requests
import tempfile
import time
from moviepy.editor import *
from moviepy.video.tools.subtitles import SubtitlesClip
import boto3
from botocore.exceptions import NoCredentialsError

# Fix ImageMagick binary detection if needed (Windows often needs this)
# os.environ["IMAGEMAGICK_BINARY"] =r"C:\Program Files\ImageMagick-7.1.1-Q16-HDRI\magick.exe"


class RenderEngine:
    def __init__(self, r2_config):
        self.r2_config = r2_config
        self.s3_client = boto3.client(
            's3',
            endpoint_url=r2_config['endpoint'],
            aws_access_key_id=r2_config['access_key'],
            aws_secret_access_key=r2_config['secret_key'],
            region_name='auto'
        )
        self.temp_dir = tempfile.mkdtemp()
        print(f"RenderEngine initialized. Temp dir: {self.temp_dir}")

    def download_asset(self, url, suffix=None):
        if not url:
            return None
        try:
            print(f"Downloading: {url}")
            response = requests.get(url, stream=True)
            response.raise_for_status()
            
            # Extract extension or use suffix
            ext = os.path.splitext(url)[1]
            if not ext and suffix:
                ext = suffix
            elif not ext:
                ext = '.tmp'
                
            filename = f"asset_{int(time.time()*1000)}{ext}"
            filepath = os.path.join(self.temp_dir, filename)
            
            with open(filepath, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            return filepath
        except Exception as e:
            print(f"Error downloading {url}: {e}")
            return None

    def upload_file(self, file_path, object_name):
        try:
            print(f"Uploading {file_path} to {self.r2_config['bucket']}/{object_name}")
            self.s3_client.upload_file(
                file_path, 
                self.r2_config['bucket'], 
                object_name,
                ExtraArgs={'ContentType': 'video/mp4', 'ACL': 'public-read'} # Adjust ACL as needed
            )
            final_url = f"{self.r2_config['public_url']}/{object_name}"
            return final_url
        except Exception as e:
            print(f"Upload failed: {e}")
            raise e

    def create_scene_clip(self, scene):
        # 1. Visual Asset (Image or Video)
        visual_path = None
        is_video = False
        
        if scene.get('videoUrl'):
            visual_path = self.download_asset(scene['videoUrl'])
            is_video = True
        elif scene.get('imageUrl'):
            visual_path = self.download_asset(scene['imageUrl'])
        
        if not visual_path:
            # Create a black clip if no visual
            clip = ColorClip(size=(1080, 1920), color=(0,0,0), duration=scene.get('duration', 5))
        else:
            if is_video:
                clip = VideoFileClip(visual_path)
                # Mute original video audio if we are adding specific narration/music
                clip = clip.without_audio() 
            else:
                clip = ImageClip(visual_path)

        # 2. Resize to 9:16 (1080x1920)
        # Assuming we want to fill the screen (center crop)
        w, h = clip.size
        target_ratio = 1080 / 1920
        current_ratio = w / h

        if current_ratio > target_ratio:
            # Wielder -> Crop sides
            new_width = h * target_ratio
            clip = clip.crop(x1=(w/2 - new_width/2), width=new_width, height=h)
        else:
            # Taller -> Crop top/bottom
            new_height = w / target_ratio
            clip = clip.crop(y1=(h/2 - new_height/2), width=w, height=new_height)
            
        clip = clip.resize(newsize=(1080, 1920))

        # 3. Audio (Narration)
        audio_path = self.download_asset(scene.get('audioUrl'))
        if audio_path:
            audio_clip = AudioFileClip(audio_path)
            clip = clip.set_audio(audio_clip)
            # Ensure video duration matches audio duration
            # Standard logic: extend image, or loop/freeze video?
            # For simplicity: duration is driven by audio
            clip = clip.set_duration(audio_clip.duration)
        else:
            # Use provided duration for images if no audio, or existing duration for video
            if not is_video:
                clip = clip.set_duration(scene.get('duration', 5))

        return clip

    def render(self, job_payload):
        scenes_data = job_payload.get('scenes', [])
        clips = []

        print("Processing scenes...")
        for i, scene in enumerate(scenes_data):
            print(f"  - Scene {i+1}/{len(scenes_data)}")
            try:
                clip = self.create_scene_clip(scene)
                clips.append(clip)
            except Exception as e:
                print(f"Error processing scene {i}: {e}")
                # Fallback?

        if not clips:
            raise ValueError("No valid scenes to render")

        final_clip = concatenate_videoclips(clips, method="compose")

        # Background Music
        bg_music_url = job_payload.get('bgMusicUrl')
        if bg_music_url:
            bg_music_path = self.download_asset(bg_music_url)
            if bg_music_path:
                bg_music = AudioFileClip(bg_music_path).volumex(0.1) # 10% volume
                
                # Loop music if shorter
                if bg_music.duration < final_clip.duration:
                    bg_music = afx.audio_loop(bg_music, duration=final_clip.duration)
                else:
                    bg_music = bg_music.subclip(0, final_clip.duration)
                
                # Mix audio
                original_audio = final_clip.audio
                if original_audio:
                    final_audio = CompositeAudioClip([original_audio, bg_music])
                    final_clip = final_clip.set_audio(final_audio)
                else:
                    final_clip = final_clip.set_audio(bg_music)

        # Output File
        output_filename = f"render_{job_payload.get('projectId')}_{int(time.time())}.mp4"
        output_path = os.path.join(self.temp_dir, output_filename)

        print(f"Rendering to {output_path}...")
        # Preset slow = better compression/quality. Bitrate for 1080p vertical.
        final_clip.write_videofile(
            output_path, 
            fps=30, 
            codec='libx264', 
            audio_codec='aac',
            preset='medium',
            threads=4
        )
        
        # Cleanup clips to free resources
        final_clip.close()
        for clip in clips:
            clip.close()

        # Upload
        print("Uploading to R2...")
        public_url = self.upload_file(output_path, f"renders/{output_filename}")
        
        # Cleanup temp file
        os.remove(output_path)
        
        return public_url

    def cleanup(self):
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)
