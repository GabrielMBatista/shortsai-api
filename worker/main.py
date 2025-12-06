
import os
import json
import time
import requests
from fastapi import FastAPI, HTTPException, Body, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Any
from dotenv import load_dotenv
from render_engine import RenderEngine

# Load Env
load_dotenv()
# Also try loading from API folder if needed (for local dev)
load_dotenv('../shortsai-api/.env')

app = FastAPI(title="ShortsAI Worker")

def get_r2_config():
    account_id = os.getenv('R2_ACCOUNT_ID')
    endpoint = os.getenv('R2_ENDPOINT')
    
    # Auto-construct endpoint if missing but account_id is present
    if not endpoint and account_id:
        endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
        
    return {
        'endpoint': endpoint,
        'access_key': os.getenv('R2_ACCESS_KEY_ID'),
        'secret_key': os.getenv('R2_SECRET_ACCESS_KEY'),
        'bucket': os.getenv('R2_BUCKET_NAME'),
        'public_url': os.getenv('NEXT_PUBLIC_STORAGE_URL') or os.getenv('R2_PUBLIC_URL', 'https://pub-your-id.r2.dev') 
    }

class RenderPayload(BaseModel):
    projectId: str
    scenes: List[Any]
    bgMusicUrl: Optional[str] = None

class RenderRequest(BaseModel):
    id: str  # Job ID
    payload: RenderPayload
    webhook_url: Optional[str] = None
    webhook_token: Optional[str] = None

def send_webhook(url: str, token: Optional[str], data: dict):
    if not url:
        return
    try:
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f"Bearer {token}"
        # Fire and forget (ish) - we don't want to block rendering too much if webhook is slow
        # but for simplicity we just request properly
        print(f"Sending webhook to {url}: {data.get('status')}")
        requests.post(url, json=data, headers=headers, timeout=5)
    except Exception as e:
        print(f"Webhook failed: {e}")

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/render")
async def render_video(job: RenderRequest):
    print(f"Received render job: {job.id}")
    
    # Define progress callback
    def progress_callback(percent):
        if job.webhook_url:
            send_webhook(
                job.webhook_url, 
                job.webhook_token, 
                {
                    "jobId": job.id,
                    "status": "processing",
                    "progress": percent
                }
            )

    try:
        # Initialize Engine
        engine = RenderEngine(get_r2_config())
        
        # Start Processing
        # Converting pydantic model to dict for engine
        payload_dict = job.payload.dict()
        
        url = engine.render(payload_dict, progress_callback=progress_callback)
        engine.cleanup()
        
        # Send completion webhook
        if job.webhook_url:
            send_webhook(
                job.webhook_url,
                job.webhook_token,
                {
                    "jobId": job.id,
                    "status": "completed",
                    "resultUrl": url
                }
            )
        
        return {
            "status": "completed",
            "resultUrl": url
        }

    except Exception as e:
        print(f"Render failed: {e}")
        import traceback
        traceback.print_exc()
        
        # Cleanup
        try:
            if 'engine' in locals(): engine.cleanup()
        except:
            pass

        # Send failure webhook
        if job.webhook_url:
            send_webhook(
                job.webhook_url,
                job.webhook_token,
                {
                    "jobId": job.id,
                    "status": "failed",
                    "error": str(e)
                }
            )

        # Return error (FastAPI will return 200 with error info or 500?)
        # Since we want to update the caller, we return status dict
        # but also raise HTTP exception? 
        # Better to return the error state so cloud run request completes "successfully" (HTTP 200) 
        # but containing the error, so caller knows logic failed, not infrastructure.
        return {
            "status": "failed",
            "error": str(e)
        }
