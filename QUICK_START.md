# 🚀 Quick Start Guide

Get up and running in **3 commands**:

```bash
# 1. Setup
make setup

# 2. Add your API keys to .env.local
# Required: OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN

# 3. Start!
make dev
```

Your app is now running at **http://localhost:3010** 🎉

---

## Daily Commands

```bash
make dev      # Start everything
make logs     # Watch logs
make stop     # Stop everything
```

## Database Commands

```bash
make db-shell     # Connect to database
make db-migrate   # Run migrations
make db-backup    # Backup database
```

## Testing

```bash
make test         # Run tests
make test-watch   # Watch mode
```

---

## Troubleshooting

**Service won't start?**
```bash
make status    # Check what's running
make restart   # Restart everything
```

**Database issues?**
```bash
make logs-db   # Check database logs
make db-reset  # Reset database (⚠️ deletes data)
```

**Port conflicts?**
```bash
# Edit docker-compose.dev.yml
# Change "5433:5432" to "5434:5432"
```

---

## Ports

- App: **3010**
- PostgreSQL: **5433**
- pgAdmin: **5050** (with `make tools`)

All ports chosen to avoid conflicts with existing services.

---

## Full Documentation

See **LOCAL_DEV.md** for complete guide.

Happy coding! 💻
