.PHONY: help dev stop restart logs logs-app logs-db clean db-shell db-migrate db-reset db-backup db-restore test test-watch build lint setup tools

# Default target
.DEFAULT_GOAL := help

# Colors for output
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

##@ General

help: ## Display this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

setup: ## First-time setup (copy env file)
	@echo "$(GREEN)Setting up local development environment...$(NC)"
	@if [ ! -f .env.local ]; then \
		cp .env.local.example .env.local; \
		echo "$(YELLOW)Created .env.local - Please edit it with your credentials!$(NC)"; \
	else \
		echo "$(YELLOW).env.local already exists$(NC)"; \
	fi
	@echo "$(GREEN)Setup complete! Edit .env.local then run: make dev$(NC)"

##@ Development

dev: ## Start development environment (PostgreSQL + App)
	@echo "$(GREEN)Starting development environment...$(NC)"
	@echo "$(YELLOW)PostgreSQL: localhost:5433$(NC)"
	@echo "$(YELLOW)App: localhost:3010$(NC)"
	docker-compose -f docker-compose.dev.yml up -d
	@echo "$(GREEN)Development environment is running!$(NC)"
	@echo "Run 'make logs' to view logs"

dev-build: ## Rebuild and start development environment
	@echo "$(GREEN)Rebuilding development environment...$(NC)"
	docker-compose -f docker-compose.dev.yml up -d --build

stop: ## Stop all services
	@echo "$(YELLOW)Stopping development environment...$(NC)"
	docker-compose -f docker-compose.dev.yml stop
	@echo "$(GREEN)Stopped!$(NC)"

down: ## Stop and remove all containers
	@echo "$(RED)Stopping and removing containers...$(NC)"
	docker-compose -f docker-compose.dev.yml down
	@echo "$(GREEN)Containers removed!$(NC)"

restart: ## Restart all services
	@echo "$(YELLOW)Restarting development environment...$(NC)"
	docker-compose -f docker-compose.dev.yml restart
	@echo "$(GREEN)Restarted!$(NC)"

restart-app: ## Restart only the app service
	@echo "$(YELLOW)Restarting app...$(NC)"
	docker-compose -f docker-compose.dev.yml restart app
	@echo "$(GREEN)App restarted!$(NC)"

restart-db: ## Restart only the database service
	@echo "$(YELLOW)Restarting database...$(NC)"
	docker-compose -f docker-compose.dev.yml restart postgres
	@echo "$(GREEN)Database restarted!$(NC)"

##@ Logs

logs: ## View logs from all services
	docker-compose -f docker-compose.dev.yml logs -f

logs-app: ## View logs from app only
	docker-compose -f docker-compose.dev.yml logs -f app

logs-db: ## View logs from database only
	docker-compose -f docker-compose.dev.yml logs -f postgres

##@ Database

db-shell: ## Open PostgreSQL shell
	@echo "$(GREEN)Connecting to PostgreSQL...$(NC)"
	@echo "Database: wup_isp_dev"
	docker-compose -f docker-compose.dev.yml exec postgres psql -U wupisp_user -d wup_isp_dev

db-migrate: ## Run database migrations
	@echo "$(GREEN)Running migrations...$(NC)"
	docker-compose -f docker-compose.dev.yml exec postgres sh -c '\
		for file in /docker-entrypoint-initdb.d/*.sql; do \
			echo "Executing $$file..."; \
			psql -U wupisp_user -d wup_isp_dev -f $$file; \
		done'
	@echo "$(GREEN)Migrations complete!$(NC)"

db-reset: ## Reset database (WARNING: Deletes all data!)
	@echo "$(RED)⚠️  WARNING: This will DELETE ALL DATA!$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		echo "$(YELLOW)Dropping and recreating database...$(NC)"; \
		docker-compose -f docker-compose.dev.yml exec postgres psql -U wupisp_user -d postgres -c "DROP DATABASE IF EXISTS wup_isp_dev;"; \
		docker-compose -f docker-compose.dev.yml exec postgres psql -U wupisp_user -d postgres -c "CREATE DATABASE wup_isp_dev;"; \
		$(MAKE) db-migrate; \
		echo "$(GREEN)Database reset complete!$(NC)"; \
	else \
		echo "$(GREEN)Cancelled.$(NC)"; \
	fi

db-backup: ## Backup database to backups/
	@echo "$(GREEN)Creating database backup...$(NC)"
	@mkdir -p backups
	docker-compose -f docker-compose.dev.yml exec -T postgres pg_dump -U wupisp_user wup_isp_dev > backups/backup_$$(date +%Y%m%d_%H%M%S).sql
	@echo "$(GREEN)Backup created in backups/$(NC)"

db-restore: ## Restore database from latest backup
	@echo "$(YELLOW)Restoring from latest backup...$(NC)"
	@latest=$$(ls -t backups/*.sql 2>/dev/null | head -1); \
	if [ -z "$$latest" ]; then \
		echo "$(RED)No backups found!$(NC)"; \
		exit 1; \
	fi; \
	echo "$(GREEN)Restoring from $$latest$(NC)"; \
	docker-compose -f docker-compose.dev.yml exec -T postgres psql -U wupisp_user wup_isp_dev < $$latest; \
	echo "$(GREEN)Restore complete!$(NC)"

db-connect-local: ## Connect to database from local machine (port 5433)
	@echo "$(GREEN)Connection info:$(NC)"
	@echo "Host: localhost"
	@echo "Port: 5433"
	@echo "Database: wup_isp_dev"
	@echo "User: wupisp_user"
	@echo "Password: wupisp_dev_password"
	@echo ""
	@echo "Example connection string:"
	@echo "postgresql://wupisk_user:wupisp_dev_password@localhost:5433/wup_isp_dev"

##@ Testing

test: ## Run tests
	@echo "$(GREEN)Running tests...$(NC)"
	pnpm test

test-watch: ## Run tests in watch mode
	@echo "$(GREEN)Running tests in watch mode...$(NC)"
	pnpm test:watch

test-ui: ## Run tests with UI
	@echo "$(GREEN)Opening test UI...$(NC)"
	pnpm test:ui

##@ Code Quality

lint: ## Run linter
	@echo "$(GREEN)Running linter...$(NC)"
	pnpm run lint

build: ## Build production bundle
	@echo "$(GREEN)Building for production...$(NC)"
	pnpm run build

##@ Utilities

tools: ## Start development environment with pgAdmin
	@echo "$(GREEN)Starting with pgAdmin...$(NC)"
	@echo "$(YELLOW)pgAdmin: http://localhost:5050$(NC)"
	@echo "$(YELLOW)Login: admin@wupisp.local / admin$(NC)"
	docker-compose -f docker-compose.dev.yml --profile tools up -d
	@echo "$(GREEN)Development environment with tools is running!$(NC)"

clean: ## Remove all containers, volumes, and images
	@echo "$(RED)⚠️  WARNING: This will remove all Docker containers, volumes, and data!$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		echo "$(YELLOW)Cleaning up...$(NC)"; \
		docker-compose -f docker-compose.dev.yml down -v --rmi local; \
		rm -rf node_modules dist; \
		echo "$(GREEN)Clean complete!$(NC)"; \
	else \
		echo "$(GREEN)Cancelled.$(NC)"; \
	fi

status: ## Show status of all services
	@echo "$(GREEN)Service Status:$(NC)"
	@docker-compose -f docker-compose.dev.yml ps

shell-app: ## Open shell in app container
	@echo "$(GREEN)Opening shell in app container...$(NC)"
	docker-compose -f docker-compose.dev.yml exec app sh

shell-db: ## Open shell in database container
	@echo "$(GREEN)Opening shell in database container...$(NC)"
	docker-compose -f docker-compose.dev.yml exec postgres sh

prune: ## Remove unused Docker resources
	@echo "$(YELLOW)Pruning unused Docker resources...$(NC)"
	docker system prune -f
	@echo "$(GREEN)Prune complete!$(NC)"
