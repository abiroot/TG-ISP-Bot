# Local Development Setup

Complete guide for setting up a local development environment with Docker and Make.

## 🚀 Quick Start

```bash
# 1. First-time setup
make setup

# 2. Edit .env.local with your credentials
# Add your OPENAI_API_KEY 

# 3. Start development environment
make dev

# 4. View logs
make logs
```

That's it! Your local environment is running on:
- **App**: http://localhost:3010
- **PostgreSQL**: localhost:5433
- **pgAdmin** (optional): http://localhost:5050

---

## 📋 Prerequisites

- **Docker Desktop** (or Docker Engine + Docker Compose)
- **Make** (pre-installed on macOS/Linux)
- **Git**

---

## 🏗️ Architecture

### Services

The local development environment consists of:

1. **PostgreSQL 15** with pgvector extension
   - Port: **5433** (host) → 5432 (container)
   - Database: `tg_isp_dev`
   - User: `tgisp_user`
   - Password: `tgisp_dev_password`

2. **Application** (Node.js 21 Alpine)
   - Port: **3010** (host) → 3010 (container)
   - Hot-reload enabled via volumes
   - Source code mounted for live changes

3. **pgAdmin** (optional)
   - Port: **5050**
   - Web UI for database management
   - Start with: `make tools`

### Port Selection

All ports are chosen to avoid conflicts:
- **5433** for PostgreSQL (instead of default 5432)
- **3010** for application (instead of 3008)
- **5050** for pgAdmin

---

## 🛠️ Makefile Commands

### General

```bash
make help         # Show all available commands
make setup        # First-time setup (creates .env.local)
make status       # Show status of all services
```

### Development

```bash
make dev          # Start all services (PostgreSQL + App)
make dev-build    # Rebuild and start (after Dockerfile changes)
make stop         # Stop all services
make down         # Stop and remove containers
make restart      # Restart all services
make restart-app  # Restart only app
make restart-db   # Restart only database
```

### Logs

```bash
make logs         # View all logs (follow mode)
make logs-app     # View app logs only
make logs-db      # View database logs only
```

### Database

```bash
make db-shell           # Open PostgreSQL interactive shell
make db-migrate         # Run migrations
make db-reset           # Reset database (⚠️ deletes all data)
make db-backup          # Backup database to backups/
make db-restore         # Restore from latest backup
make db-connect-local   # Show connection info for external tools
```

### Testing

```bash
make test         # Run tests once
make test-watch   # Run tests in watch mode
make test-ui      # Run tests with UI
```

### Code Quality

```bash
make lint         # Run ESLint
make build        # Build production bundle
```

### Utilities

```bash
make tools        # Start with pgAdmin (http://localhost:5050)
make shell-app    # Open shell in app container
make shell-db     # Open shell in database container
make clean        # Remove everything (⚠️ nuclear option)
make prune        # Clean up unused Docker resources
```

---

## 📝 Detailed Setup

### Step 1: Clone and Setup

```bash
# Clone repository (if not already done)
cd tg-ISP-Bot

# Create local environment file
make setup

# This creates .env.local from .env.local.example
```

### Step 2: Configure Environment

Edit `.env.local` with your credentials:

```bash
# Required
OPENAI_API_KEY=sk-...                          # From OpenAI dashboard
GOOGLE_API_KEY=...                             # From Google AI dashboard
TELEGRAM_BOT_TOKEN=...                         # From BotFather on Telegram
```

**Important**: Database connection settings are already configured for Docker and should NOT be changed.

**Note**: No webhook configuration needed for Telegram - the bot connects directly to Telegram API.

### Step 3: Start Environment

```bash
# Start PostgreSQL + Application
make dev

# OR with pgAdmin
make tools
```

First start will:
1. Pull Docker images (~500MB)
2. Build application image
3. Create volumes
4. Run database migrations
5. Start services

**Time**: ~2-5 minutes on first run

### Step 4: Verify

```bash
# Check service status
make status

# View logs
make logs

# Test database connection
make db-shell
```

---

## 🔄 Development Workflow

### Daily Development

```bash
# Morning: Start environment
make dev

# Make code changes (hot-reload automatic)
# Edit files in src/

# View logs
make logs

# Evening: Stop services
make stop
```

### Code Changes

- **TypeScript/JavaScript**: Auto-reload (nodemon)
- **Package changes**: Run `make restart-app`
- **Docker changes**: Run `make dev-build`
- **Database schema**: Run `make db-migrate`

### Database Operations

```bash
# Open PostgreSQL shell
make db-shell

# Inside shell:
\dt              # List tables
\d messages      # Describe messages table
SELECT * FROM personalities;

# Backup before risky operations
make db-backup

# Reset if things go wrong
make db-reset
```

### Testing

```bash
# Run tests (uses Docker database)
make test

# Watch mode for TDD
make test-watch

# Interactive UI
make test-ui
```

---

## 🗄️ Database Management

### Using psql (Command Line)

```bash
# Via Make
make db-shell

# Direct connection
psql postgresql://tgisp_user:tgisp_dev_password@localhost:5433/tg_isp_dev
```

### Using pgAdmin (Web UI)

```bash
# Start with pgAdmin
make tools

# Open browser
open http://localhost:5050

# Login
Email: admin@tgisp.local
Password: admin

# Add server
Host: postgres (or host.docker.internal)
Port: 5432
Database: tg_isp_dev
User: tgisp_user
Password: tgisp_dev_password
```

### Using External Tools

**Connection String**:
```
postgresql://tgisp_user:tgisp_dev_password@localhost:5433/tg_isp_dev
```

**Individual Settings**:
- Host: `localhost`
- Port: `5433`
- Database: `tg_isp_dev`
- User: `tgisp_user`
- Password: `tgisp_dev_password`

**Compatible Tools**:
- DataGrip (JetBrains)
- DBeaver
- TablePlus
- Postico
- VS Code PostgreSQL extensions

---

## 🐛 Troubleshooting

### Port Already in Use

```bash
# Check what's using port 5433
lsof -i :5433

# Or use different port in docker-compose.dev.yml
ports:
  - "5434:5432"  # Change to 5434
```

### Database Connection Failed

```bash
# Check if PostgreSQL is healthy
make status

# View database logs
make logs-db

# Restart database
make restart-db
```

### Application Won't Start

```bash
# Check app logs
make logs-app

# Verify .env.local exists and has correct values
cat .env.local

# Rebuild
make dev-build
```

### Migrations Failed

```bash
# Check migration files exist
ls -la src/database/migrations/

# Run migrations manually
make db-migrate

# If corrupted, reset
make db-reset
```

### Out of Disk Space

```bash
# Clean up Docker resources
make prune

# Nuclear option (removes volumes too)
make clean
```

### Hot Reload Not Working

```bash
# Check volume mounts
docker inspect tgisp-app-dev | grep -A 10 Mounts

# Restart app
make restart-app

# If still not working, rebuild
make dev-build
```

---

## 📊 Performance Tips

### Speed Up Rebuilds

```bash
# Use BuildKit (faster builds)
export DOCKER_BUILDKIT=1

# Parallel pulls
export COMPOSE_PARALLEL_LIMIT=10
```

### Reduce Resource Usage

Edit `docker-compose.dev.yml`:

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
```

### Clean Up Regularly

```bash
# Every week
make prune

# When switching branches
make restart
```

---

## 🔒 Security Notes

### Credentials

- **Never commit** `.env.local`
- **Use strong passwords** in production
- **Rotate API keys** regularly

### Database

- Default password is for local dev only
- Production uses different credentials
- Database is NOT exposed externally

### Docker

- Containers run in isolated network
- Only specified ports are exposed
- Volumes persist data between restarts

---

## 🚢 Production vs Development

| Aspect | Development | Production |
|--------|-------------|------------|
| Port | 3010 | 3008 |
| Database | Local Docker (5433) | DigitalOcean |
| Hot Reload | Yes | No |
| Build | Development | Optimized |
| Volumes | Mounted | None |
| Size | ~800MB | ~400MB |

---

## 📚 Additional Resources

- **Main README**: `README.md`
- **Testing Guide**: `TESTING.md`
- **Database Schema**: `DATABASE_SCHEMA.md`
- **Development Guide**: `DEVELOPMENT.md`
- **RAG Implementation**: `RAG_IMPLEMENTATION.md`

---

## 🆘 Getting Help

If you encounter issues:

1. Check this guide's troubleshooting section
2. View logs: `make logs`
3. Check service status: `make status`
4. Try clean restart: `make down && make dev`
5. Check GitHub issues
6. Ask in team chat

---

## 🎉 Success Checklist

- [ ] Docker Desktop installed and running
- [ ] `make setup` completed
- [ ] `.env.local` configured with API keys
- [ ] `make dev` starts without errors
- [ ] Can access http://localhost:3010
- [ ] `make db-shell` connects successfully
- [ ] `make logs` shows application logs
- [ ] `make test` runs successfully

If all checkboxes are checked, you're ready to develop! 🚀
