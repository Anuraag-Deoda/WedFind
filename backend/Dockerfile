FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# System dependencies for OpenCV, InsightFace, python-magic
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    cmake \
    python3-dev \
    libgl1 \
    libglib2.0-0 \
    libmagic1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create storage and cache directories
RUN mkdir -p storage/originals storage/processed storage/thumbnails storage/selfies \
    chromadb_data data .insightface

# Create non-root user and own everything
RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8888

# Gunicorn with production settings
# --preload loads the app (+ InsightFace model) once in master before forking workers
CMD ["gunicorn", \
     "--bind", "0.0.0.0:8888", \
     "--preload", \
     "--workers", "2", \
     "--threads", "4", \
     "--timeout", "300", \
     "--graceful-timeout", "30", \
     "--keep-alive", "5", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "--log-level", "info", \
     "run:app"]
