VENV = backend/venv
PYTHON = $(VENV)/bin/python
PIP = $(VENV)/bin/pip
CELERY = $(VENV)/bin/celery

.PHONY: dev backend frontend redis worker setup clean venv up down logs health

# ── Local Development ────────────────────────────────────────────────

# Start everything for development
dev: redis backend worker frontend

# Backend Flask server
backend:
	cd backend && FLASK_ENV=development LOG_FORMAT=text ../$(PYTHON) run.py

# Frontend Next.js dev server
frontend:
	cd frontend && npm run dev

# Redis via Docker
redis:
	docker run -d --name wedding-redis -p 6379:6379 redis:7-alpine 2>/dev/null || true

# Celery worker
worker:
	cd backend && ../$(CELERY) -A app.tasks.celery_app:celery worker --loglevel=info --concurrency=2

# Celery beat scheduler
beat:
	cd backend && ../$(CELERY) -A app.tasks.celery_app:celery beat --loglevel=info

# ── Setup ─────────────────────────────────────────────────────────────

# Create venv and install deps
venv:
	python3 -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r backend/requirements.txt

# Install all dependencies
setup: venv
	cd frontend && npm install

# ── Docker Compose ────────────────────────────────────────────────────

# Build and start all services
up:
	cp -n .env.example .env 2>/dev/null || true
	docker compose up --build

# Start in background
up-d:
	cp -n .env.example .env 2>/dev/null || true
	docker compose up --build -d

# Stop all services
down:
	docker compose down

# View logs
logs:
	docker compose logs -f

# Check service health
health:
	@echo "=== Service Health ==="
	@curl -s http://localhost:8080/api/health | python3 -m json.tool 2>/dev/null || echo "Services not running"

# ── Maintenance ───────────────────────────────────────────────────────

# Clean generated files (preserves DB)
clean:
	rm -rf backend/storage/originals/* backend/storage/processed/* backend/storage/thumbnails/* backend/storage/selfies/*

# Full reset (deletes everything)
reset: clean
	rm -rf backend/chromadb_data/*
	rm -f backend/data/app.db
	docker compose down -v
