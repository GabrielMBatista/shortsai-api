
import json
import time
import os
import sys
from dotenv import load_dotenv
from render_engine import RenderEngine

# Load Env
load_dotenv()
# Also try loading from API folder if needed
load_dotenv('../shortsai-api/.env')

# Load Env
load_dotenv()

# QUEUE PATH configuration
# In Docker, we will mount the queue file/dir to a shared location
# Default to local relative path for development
DEFAULT_QUEUE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'queue.json')
QUEUE_FILE = os.getenv('QUEUE_PATH_WORKER', DEFAULT_QUEUE_PATH)

def get_r2_config():
    return {
        'endpoint': os.getenv('R2_ENDPOINT'),
        'access_key': os.getenv('R2_ACCESS_KEY_ID'),
        'secret_key': os.getenv('R2_SECRET_ACCESS_KEY'),
        'bucket': os.getenv('R2_BUCKET_NAME'),
        'public_url': os.getenv('R2_PUBLIC_URL', 'https://pub-your-id.r2.dev') 
    }

def process_job(job):
    print(f"Processing job {job['id']}...")
    engine = None
    try:
        engine = RenderEngine(get_r2_config())
        url = engine.render(job['payload'])
        engine.cleanup()
        return url
    except Exception as e:
        print(f"Job failed: {e}")
        if engine: 
            engine.cleanup() 
        raise e

def main_loop():
    print(f"Worker started. Monitoring queue at {QUEUE_FILE}...")
    while True:
        try:
            if not os.path.exists(QUEUE_FILE):
                print(f"Queue file not found at {QUEUE_FILE}, waiting...")
                time.sleep(5)
                continue

            # Read Queue safely
            with open(QUEUE_FILE, 'r', encoding='utf-8') as f:
                try:
                    queue = json.load(f)
                except json.JSONDecodeError:
                    print("Queue file is empty or invalid JSON")
                    queue = []
            
            # Find Pending Job
            job_idx = -1
            job = None
            for i, j in enumerate(queue):
                if j.get('status') == 'pending' and j.get('type') == 'render_video':
                    job_idx = i
                    job = j
                    break
            
            if job:
                # MARK PROCESSING
                print(f"Claiming job {job['id']}...")
                queue[job_idx]['status'] = 'processing'
                queue[job_idx]['startedAt'] = time.strftime('%Y-%m-%dT%H:%M:%S.000Z')
                
                try:
                    with open(QUEUE_FILE, 'w', encoding='utf-8') as f:
                        json.dump(queue, f, indent=2)
                except Exception as e:
                    print("Failed to lock/write queue, skipping...")
                    time.sleep(1)
                    continue
                
                # EXECUTE
                status = 'failed'
                result_url = None
                error_msg = None
                
                try:
                    result_url = process_job(job)
                    status = 'completed'
                except Exception as e:
                    status = 'failed'
                    error_msg = str(e)
                    import traceback
                    traceback.print_exc()

                # UPDATE STATUS (Re-read to ensure we don't clobber other new jobs)
                with open(QUEUE_FILE, 'r', encoding='utf-8') as f:
                    current_queue = json.load(f)
                
                # Find job again
                found = False
                for item in current_queue:
                    if item['id'] == job['id']:
                        item['status'] = status
                        item['completedAt'] = time.strftime('%Y-%m-%dT%H:%M:%S.000Z')
                        if result_url:
                            item['resultUrl'] = result_url
                        if error_msg:
                            item['error'] = error_msg
                        found = True
                        break
                
                if found:
                    with open(QUEUE_FILE, 'w', encoding='utf-8') as f:
                        json.dump(current_queue, f, indent=2)
                    print(f"Job {job['id']} finished with status: {status}")
                else:
                    print("Job disappeared from queue while processing??")

            else:
                time.sleep(3) # Wait before polling again

        except Exception as e:
            print(f"Main loop error: {e}")
            import traceback
            traceback.print_exc()
            time.sleep(5)

if __name__ == "__main__":
    main_loop()
