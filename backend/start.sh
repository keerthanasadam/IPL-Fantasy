#!/bin/sh
timeout 60 alembic upgrade head || echo 'Alembic timed out or failed, skipping'
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
