COMPOSE  ?= docker compose
BACKEND  ?= $(COMPOSE) run --rm backend
FRONTEND ?= $(COMPOSE) run --rm frontend

.DEFAULT_GOAL := help
.PHONY: help up down logs migrate makemigrations test test-backend test-frontend \
        lint lint-backend lint-frontend format check schema messages superuser

help: ## List the available commands
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up: ## Start the docker-compose stack (http://localhost)
	$(COMPOSE) up -d --build

down: ## Stop the docker-compose stack
	$(COMPOSE) down

logs: ## Follow the logs of every service
	$(COMPOSE) logs -f

migrate: ## Apply migrations (including seed data migrations)
	$(BACKEND) python manage.py migrate

makemigrations: ## Create migrations for model changes
	$(BACKEND) python manage.py makemigrations

test: test-backend test-frontend ## Backend and front-end tests with coverage

test-backend:
	$(BACKEND) pytest

test-frontend:
	$(FRONTEND) npm test

lint: lint-backend lint-frontend ## ruff, mypy, import-linter, ESLint, Prettier, tsc

lint-backend:
	$(BACKEND) ruff check .
	$(BACKEND) ruff format --check .
	$(BACKEND) mypy .
	$(BACKEND) lint-imports

lint-frontend:
	$(FRONTEND) npm run lint
	$(FRONTEND) npm run format:check
	$(FRONTEND) npm run typecheck

format: ## Auto-format backend and front end
	$(BACKEND) ruff format .
	$(BACKEND) ruff check --fix .
	$(FRONTEND) npm run format

check: lint test ## lint + test — must pass before opening a Pull Request

schema: ## Regenerate the OpenAPI schema (backend/openapi.yaml)
	$(BACKEND) python manage.py spectacular --file openapi.yaml --validate

messages: ## Extract and compile backend .po files (EN/FR)
	$(BACKEND) python manage.py makemessages -l en -l fr --ignore=.venv
	$(BACKEND) python manage.py compilemessages --ignore=.venv

superuser: ## Create a technical Django admin account (not the General Manager)
	$(BACKEND) python manage.py createsuperuser
