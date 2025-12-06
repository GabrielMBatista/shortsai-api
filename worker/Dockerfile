
# Use Python Slim
FROM python:3.9-slim

# Install system dependencies for MoviePy/ImageMagick
RUN apt-get update && apt-get install -y \
    ffmpeg \
    imagemagick \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Fix ImageMagick policy (allow reading/writing rights)
RUN sed -i 's/none/read,write/g' /etc/ImageMagick-6/policy.xml

WORKDIR /app

# Copy requirements first
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Environment variables will be injected by docker-compose
# QUEUE file path should be mapped via volume

CMD ["python", "-u", "main.py"]
