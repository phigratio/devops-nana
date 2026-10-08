# Thin wrappers around the docker compose commands. `make help` lists them.
COMPOSE      := docker compose
DEV          := $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml
BACKUP_DIR   ?= backups
STAMP        := $(shell date +%Y%m%d-%H%M%S)

.DEFAULT_GOAL := help
.PHONY: help secrets init build up down restart logs ps health shell db-shell \
        dev dev-down tools backup restore clean nuke

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

secrets: ## Generate ./secrets/*.txt password files
	@./scripts/generate-secrets.sh

init: secrets ## First-time setup: secrets + .env
	@test -f .env || (cp .env.example .env && echo "created .env")

build: ## Build the app image
	$(COMPOSE) build

up: ## Start the stack in the background
	$(COMPOSE) up -d

down: ## Stop the stack (keeps data)
	$(COMPOSE) down

restart: ## Restart the app only
	$(COMPOSE) restart app

logs: ## Follow logs
	$(COMPOSE) logs -f

ps: ## Show container status
	$(COMPOSE) ps

health: ## Hit the health endpoint
	@curl -fsS localhost:$${APP_PORT:-3000}/api/health && echo

shell: ## Shell into the app container
	$(COMPOSE) exec app sh

db-shell: ## mongosh inside the mongo container, as the root user
	$(COMPOSE) exec mongo sh -c \
		'mongosh -u "$$MONGO_INITDB_ROOT_USERNAME" -p "$$(cat $$MONGO_INITDB_ROOT_PASSWORD_FILE)" --authenticationDatabase admin'

dev: ## Start with the development overlay (live reload)
	$(DEV) up --build

dev-down: ## Stop the development stack
	$(DEV) down

tools: ## Start mongo-express alongside the stack
	$(COMPOSE) --profile tools up -d

backup: ## Dump the database to ./backups
	@mkdir -p $(BACKUP_DIR)
	$(COMPOSE) exec -T mongo sh -c \
		'mongodump -u "$$MONGO_INITDB_ROOT_USERNAME" -p "$$(cat $$MONGO_INITDB_ROOT_PASSWORD_FILE)" \
		--authenticationDatabase admin --archive --gzip' > $(BACKUP_DIR)/mongo-$(STAMP).gz
	@echo "wrote $(BACKUP_DIR)/mongo-$(STAMP).gz"

restore: ## Restore a dump: make restore FILE=backups/mongo-....gz
	@test -n "$(FILE)" || (echo "usage: make restore FILE=backups/mongo-....gz" && exit 1)
	$(COMPOSE) exec -T mongo sh -c \
		'mongorestore -u "$$MONGO_INITDB_ROOT_USERNAME" -p "$$(cat $$MONGO_INITDB_ROOT_PASSWORD_FILE)" \
		--authenticationDatabase admin --archive --gzip --drop' < $(FILE)

clean: ## Stop and remove containers and images, keep data
	$(COMPOSE) down --rmi local

nuke: ## Stop everything and DELETE the database volume
	$(COMPOSE) down -v
