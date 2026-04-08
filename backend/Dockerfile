FROM python:3.11-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copy project files
COPY pyproject.toml ./
COPY agent ./agent
COPY token_server.py ./

# Install dependencies into a system venv
RUN uv sync --no-dev

# Create data directory for SQLite (will be mounted as a volume)
RUN mkdir -p /app/data

# Default command — overridden in docker-compose.yml per service
CMD ["uv", "run", "python", "-m", "agent.worker", "dev"]
