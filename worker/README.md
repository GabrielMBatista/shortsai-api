# 🐍 Video Render Worker

This is a Python-based microservice responsible for the heavy lifting of video generation. It uses **MoviePy** to assemble images, audio, and subtitles into a final video file.

## 🛠️ Stack
*   **Python 3.11+**
*   **FastAPI**: Server framework.
*   **MoviePy**: Video editing library.
*   **Google Cloud Run**: Serverless deployment target.

## 🚀 Local Development

1.  **Create a virtual environment:**
    ```bash
    python -m venv venv
    source venv/bin/activate  # Mac/Linux
    # .\venv\Scripts\activate # Windows
    ```

2.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

3.  **Run the service:**
    ```bash
    uvicorn main:app --reload --port 8080
    ```
    The worker will listen on `http://localhost:8080`.

## ☁️ Deployment (Cloud Run)

The worker is designed to run as a stateless container on Google Cloud Run.

### Deployment Script
Use the provided script to build and deploy:
```bash
./deploy-worker.sh
```
This script handles building the Docker image and pushing it to Google Artifact Registry, then updating the Cloud Run service.

> **⚠️ Performance Note:** Running this worker on Google Cloud Run's **Free Tier** (fully managed) may result in slow rendering times due to "Cold Starts" and CPU throttling during heavy ffmpeg processing. For better performance, consider using **Cloud Run with always-on CPU** or deploying this container to a VPS/Dedicated server.

## 📝 Environment Variables
The worker expects credentials for accessing R2 (or S3-compatible storage) to download assets and upload the result. Ensure these are set in your local `.env` or Cloud Run secrets.
