
import os
import requests
import tempfile
import time
import PIL.Image
# Monkey patch ANTIALIAS for Pillow 10+ compatibility with MoviePy
if not hasattr(PIL.Image, 'ANTIALIAS'):
    PIL.Image.ANTIALIAS = PIL.Image.LANCZOS

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

    def _create_ken_burns_clip(self, image_path, duration):
        """
        Creates a clip from an image with a SIMPLIFIED zoom (Ken Burns) effect.
        Removed per-frame resize for extreme speed.
        """
        # Load image
        clip = ImageClip(image_path).set_duration(duration)
        w, h = clip.size
        
        # Target Vertical 9:16
        target_w, target_h = 1080, 1920
        target_ratio = target_w / target_h
        img_ratio = w / h

        # Initial Crop (Center Fill)
        if img_ratio > target_ratio:
            current_w = h * target_ratio
            clip = clip.crop(x1=(w/2 - current_w/2), width=current_w, height=h)
        else:
            current_h = w / target_ratio
            clip = clip.crop(y1=(h/2 - current_h/2), width=w, height=current_h)
            
        clip = clip.resize(newsize=(target_w, target_h))

        # REMOVED zoom effect for speed - static image
        return clip

    def _create_subtitle_clips(self, narration_text, word_timings, duration):
        """
        Generates a list of TextClips for the subtitles based on word timings.
        Similar to the Frontend style (Yellow highlight).
        """
        if not word_timings:
            return []
            
        subs = []
        # Font settings - matching frontend "Komika Axis" or generic bold
        font_size = 70
        font = 'Arial-Bold' # System font available in Linux
        stroke_color = 'black'
        stroke_width = 3
        
        # We need to group words into lines or just show words?
        # Frontend shows a block of text and highlights current word.
        # Simulating that in MoviePy is hard (requires generating many images).
        # Easier approach for V1: Show 3-5 words at a time (Caption style) OR Word-by-word.
        # Let's try Word-by-Word Karaoke (Highlighted word in context is too heavy to render per frame).
        # Fallback: Standard Captions (group of words).
        
        # Let's stick to the JSON 'wordTimings' which usually has {word, start, end}.
        # We will render the current word or short phrase.
        
        for timing in word_timings:
            word = timing.get('word', '')
            start = timing.get('start', 0)
            end = timing.get('end', 0)
            
            # Clamp end
            if end > duration: end = duration
            if start >= duration: continue
            
            # Create TextClip
            # Yellow text with black outline
            txt_clip = (TextClip(word, fontsize=font_size, font=font, color='yellow', stroke_color=stroke_color, stroke_width=stroke_width, method='caption', size=(900, None))
                        .set_position(('center', 1500)) # Bottom area
                        .set_start(start)
                        .set_duration(end - start))
            subs.append(txt_clip)
            
        return subs

    def create_scene_clip(self, scene):
        duration = scene.get('duration', 5)
        
        # 1. Audio Setup (Determines strict duration if present)
        audio_path = self.download_asset(scene.get('audioUrl'))
        audio_clip = None
        if audio_path:
            audio_clip = AudioFileClip(audio_path)
            duration = audio_clip.duration # Override duration with actual audio length

        # 2. Visual Clip
        visual_path = None
        is_video = False
        base_clip = None
        
        if scene.get('videoUrl'):
            visual_path = self.download_asset(scene['videoUrl'])
            is_video = True
        elif scene.get('imageUrl'):
            visual_path = self.download_asset(scene['imageUrl'])
            
        if not visual_path:
            base_clip = ColorClip(size=(1080, 1920), color=(0,0,0), duration=duration)
        else:
            if is_video:
                # Video processing
                raw_clip = VideoFileClip(visual_path).without_audio()
                
                # 1. Resize/Crop Video to 9:16 first
                w, h = raw_clip.size
                target_ratio = 1080 / 1920
                img_ratio = w / h
                if img_ratio > target_ratio:
                    current_w = h * target_ratio
                    raw_clip = raw_clip.crop(x1=(w/2 - current_w/2), width=current_w, height=h)
                else:
                    current_h = w / target_ratio
                    raw_clip = raw_clip.crop(y1=(h/2 - current_h/2), width=w, height=current_h)
                
                raw_clip = raw_clip.resize(newsize=(1080, 1920))
                
                # 2. Check Duration & Extend if needed
                if raw_clip.duration < duration:
                    # Video is shorter than audio -> Freeze & Zoom extension
                    remaining_duration = duration - raw_clip.duration
                    if remaining_duration > 0.1: # Only if significant
                        # Save last frame
                        last_frame_path = os.path.join(self.temp_dir, f"frame_{int(time.time()*1000)}.png")
                        raw_clip.save_frame(last_frame_path, t=raw_clip.duration - 0.05)
                        
                        # Apply Ken Burns to the frozen frame
                        # Since it's already 1080x1920, _create_ken_burns_clip will just apply zoom
                        freeze_clip = self._create_ken_burns_clip(last_frame_path, remaining_duration)
                        
                        # Concatenate
                        base_clip = concatenate_videoclips([raw_clip, freeze_clip])
                    else:
                        base_clip = raw_clip
                else:
                    base_clip = raw_clip.subclip(0, duration)
            else:
                # Image: Apply Ken Burns
                base_clip = self._create_ken_burns_clip(visual_path, duration)

        # Attach Audio
        if audio_clip:
            base_clip = base_clip.set_audio(audio_clip)
        
        # Ensure final total duration matches exactly (concatenation might drift slightly)
        base_clip = base_clip.set_duration(duration)

        # 3. Subtitles Overlay
        # Assuming 'wordTimings' is passed in the scene object
        word_timings = scene.get('wordTimings', [])
        subtitle_clips = self._create_subtitle_clips(scene.get('narration', ''), word_timings, duration)
        
        if subtitle_clips:
            # Composite visual + subtitles
            final_clip = CompositeVideoClip([base_clip] + subtitle_clips).set_duration(duration)
            return final_clip
        
        return base_clip

    def render(self, job_payload, progress_callback=None):
        scenes_data = job_payload.get('scenes', [])
        total_scenes = len(scenes_data)
        clips = []

        print("Processing scenes...")
        for i, scene in enumerate(scenes_data):
            print(f"  - Scene {i+1}/{total_scenes}")
            
            # Report progress (0-80% allocated for scene processing)
            if progress_callback:
                progress = int((i / total_scenes) * 80)
                progress_callback(progress)
                
            try:
                clip = self.create_scene_clip(scene)
                clips.append(clip)
            except Exception as e:
                print(f"Error processing scene {i}: {e}")
                # Fallback?

        if not clips:
            raise ValueError("No valid scenes to render")
            
        if progress_callback:
            progress_callback(80) # Scenes done

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
        
        if progress_callback: progress_callback(90)
        
        # EXTREME SPEED optimizations with 2 CPU limit (Free Tier)
        # Target: ~2-3min render time (down from 10min)
        final_clip.write_videofile(
            output_path, 
            fps=20,  # Ultra low FPS for speed (still acceptable for shorts)
            codec='libx264', 
            audio_codec='aac',
            preset='veryfast',  # Faster encoding
            threads=2,  # Match Cloud Run free tier CPU allocation
            bitrate='2500k',  # Lower bitrate = faster encode
            audio_bitrate='128k',  # Lower audio bitrate
            audio=True,
            verbose=False,
            logger=None,
            write_logfile=False,  # No log file
            temp_audiofile_path=None  # Disable temp audio file
        )
        
        # Cleanup clips to free resources
        final_clip.close()
        for clip in clips:
            clip.close()

        # Upload
        print("Uploading to R2...")
        if progress_callback: progress_callback(95)
        public_url = self.upload_file(output_path, f"renders/{output_filename}")
        
        # Cleanup temp file
        os.remove(output_path)
        
        return public_url

    def cleanup(self):
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)
