#!/bin/bash
set -e

# Ensure we're in the correct directory
cd $SITE_PATH || {
    echo "❌ ERROR: SITE_PATH not set or directory doesn't exist"
    exit 1
}

echo "📥 Pulling latest code from Git..."
# Configure git to handle divergent branches with rebase
git config pull.rebase true

# Add error handling for git operations
if ! git pull origin $BRANCH; then
    echo "❌ ERROR: Git pull failed. Checking SSH configuration..."
    ssh -T git@github.com || echo "⚠️  SSH to GitHub failed - check SSH keys"
    exit 1
fi

echo "📦 Installing dependencies..."
# Need to install devDependencies for build (rollup, typescript, etc.)
npm install

echo "🧹 Cleaning build cache and fixing permissions..."
# Fix ownership of cache directory to vito user, then clear rollup cache
sudo chown -R vito:vito node_modules/.cache 2>/dev/null || true
sudo rm -rf node_modules/.cache/rollup-plugin-typescript2 2>/dev/null || true

echo "🏗️  Building application..."
npm run build

echo "🧹 Cleaning up devDependencies..."
# Remove devDependencies after build to save space
npm prune --production

echo "📄 Copying migration files to dist..."
mkdir -p dist/database/migrations
cp -r src/database/migrations/*.sql dist/database/migrations/

echo "📁 Creating logs directory with proper permissions..."
mkdir -p logs
sudo chown -R vito:vito logs 2>/dev/null || true
sudo chmod 755 logs 2>/dev/null || true

# Create initial log files to prevent "log file doesn't exist" errors
touch logs/error.log logs/out.log
sudo chown vito:vito logs/*.log 2>/dev/null || true
sudo chmod 644 logs/*.log 2>/dev/null || true

echo "🔄 Restarting application with PM2..."
pm2 stop $DOMAIN 2>/dev/null || true
pm2 delete $DOMAIN 2>/dev/null || true

# Start using ecosystem configuration file for better control
if [ -f "ecosystem.config.cjs" ]; then
    echo "📋 Using ecosystem.config.cjs for PM2 configuration"
    pm2 start ecosystem.config.cjs
else
    echo "⚠️  ecosystem.config.cjs not found, using manual configuration"
    # Fallback to manual configuration
    pm2 start dist/app.js \
    --name "$DOMAIN" \
    --interpreter node \
    --max-restarts 10 \
    --min-uptime 10000 \
    --restart-delay 5000 \
    --exp-backoff-restart-delay 1000 \
    --max-memory-restart 500M \
    --error-file ./logs/error.log \
    --out-file ./logs/out.log \
    --time
fi

# Save PM2 configuration
pm2 save

# Wait for app to stabilize
echo "⏳ Waiting for application to stabilize..."
sleep 5

# Ensure log files exist and have proper permissions
echo "🔍 Checking log files..."
if [ ! -f "logs/error.log" ]; then
    touch logs/error.log
    sudo chown vito:vito logs/error.log 2>/dev/null || true
fi
if [ ! -f "logs/out.log" ]; then
    touch logs/out.log
    sudo chown vito:vito logs/out.log 2>/dev/null || true
fi

# Check if app is running
if pm2 info $DOMAIN | grep -q "online"; then
    echo "✅ Deployment complete and application is ONLINE!"
else
    echo "❌ WARNING: Application may not have started correctly"
    echo "📋 Recent logs:"
    pm2 logs $DOMAIN --lines 20 --nostream || echo "No logs available yet"

    echo "🔍 PM2 process info:"
    pm2 info $DOMAIN || echo "Process info not available"

    echo "🔍 System log files:"
    ls -la logs/ || echo "Logs directory not found"

    exit 1
fi

echo "📊 PM2 Status:"
pm2 status

echo ""
echo "🔍 To view logs: pm2 logs $DOMAIN"
echo "🔍 To restart: pm2 restart $DOMAIN"
echo "🔍 To stop: pm2 stop $DOMAIN"