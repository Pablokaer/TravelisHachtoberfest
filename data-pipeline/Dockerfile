# The city-builder service (`python -m wayfarer_pipeline serve`, D-079) as a container, for Render
# and DigitalOcean App Platform (D-084). Build context: this folder (data-pipeline/).
FROM python:3.12-slim

# psql: the service reaches Postgres through it (local/database.py), not through a driver.
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN pip install --no-cache-dir "pydantic>=2.8" "PyYAML>=6.0" "requests>=2.32" \
    "sentry-sdk>=2.0" "pymongo>=4.8"
COPY . /app

# DATABASE_URL: the Postgres to build cities into (never the production one: the service has no
# sign-in, anyone who can reach it can ask for a city). PLANNER=rules when no Ollama is reachable.
ENV PORT=8787 PLANNER=auto OLLAMA_MODEL=qwen2.5:7b OLLAMA_URL=http://localhost:11434
EXPOSE 8787
CMD ["sh", "-c", "exec python -m wayfarer_pipeline serve --host 0.0.0.0 --port \"$PORT\" --db-url \"$DATABASE_URL\" --planner \"$PLANNER\" --model \"$OLLAMA_MODEL\" --ollama-url \"$OLLAMA_URL\""]
