# One entry point for both halves of the project. Run `make` to see what is available.
.DEFAULT_GOAL := help
.PHONY: help setup dev api build lint test e2e eval check clean

help: ## Show this list
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  \033[36m%-8s\033[0m %s\n", $$1, $$2}'

setup: ## Install extension and backend dependencies
	cd extension && npm install
	cd backend && uv sync

dev: ## Run the new tab page in demo mode
	cd extension && npm run dev

api: ## Run the API locally on SQLite with development sign in
	cd backend && HOMEBASE_DEV_AUTH=true uv run uvicorn app.main:app --reload --port 8000

build: ## Build the extension into extension/dist
	cd extension && npm run build

lint: ## Lint and type-check everything
	cd extension && npm run lint && npm run typecheck
	cd backend && uv run ruff check . && uv run ruff format --check .

test: ## Unit and API tests
	cd extension && npm test
	cd backend && uv run pytest -q

e2e: build ## Browser tests against the built extension
	cd extension && npm run e2e

eval: ## Compare every ML feature with its baseline
	cd backend && uv run python scripts/evaluate.py

check: lint test e2e ## Everything CI runs

clean: ## Remove build output and caches (keeps dependencies and your data)
	rm -rf extension/dist extension/test-results extension/playwright-report backend/eval
	find . -name __pycache__ -not -path './backend/.venv/*' -not -path '*/node_modules/*' -prune -exec rm -rf {} +
