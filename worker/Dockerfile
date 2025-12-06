
# Use Python Slim
FROM python:3.9-slim

# Install system dependencies for MoviePy/ImageMagick
RUN apt-get update && apt-get install -y \
    ffmpeg \
    imagemagick \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Fix ImageMagick policy (allow reading/writing rights)
# Locate policy.xml safely (can be in ImageMagick-6 or just ImageMagick)
RUN find /etc -name "policy.xml" -exec sed -i 's/none/read,write/g' {} +

WORKDIR /app

# Copy requirements first
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Environment variables will be injected by docker-compose
# QUEUE file path should be mapped via volume

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
