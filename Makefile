.PHONY: up down logs migrate seed test backend-shell db-shell

# Start all services
up:
	docker compose up --build -d

# Stop all services
down:
	docker compose down

# View logs
logs:
	docker compose logs -f

# Run database migrations
migrate:
	docker compose exec backend alembic upgrade head

# Create a new migration
migration:
	docker compose exec backend alembic revision --autogenerate -m "$(msg)"

# Seed the database
seed:
	docker compose exec backend python -m app.seed

# Run backend tests
test:
	docker compose exec backend pytest -v

# Shell into backend container
backend-shell:
	docker compose exec backend bash

# Connect to database
db-shell:
	docker compose exec db psql -U ipl -d ipl_fantasy

# Reset database (drop and recreate)
db-reset:
	docker compose exec db psql -U ipl -d postgres -c "DROP DATABASE IF EXISTS ipl_fantasy;"
	docker compose exec db psql -U ipl -d postgres -c "CREATE DATABASE ipl_fantasy;"
	$(MAKE) migrate
