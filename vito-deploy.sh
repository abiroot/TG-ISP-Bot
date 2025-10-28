#!/bin/bash
set -e

cd $SITE_PATH

echo "📥 Pulling latest code from Git..."
# Configure git to handle divergent branches with rebase
git config pull.rebase true
git pull origin $BRANCH

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

echo "📁 Creating logs directory..."
mkdir -p logs

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

# Check if app is running
if pm2 info $DOMAIN | grep -q "online"; then
    echo "✅ Deployment complete and application is ONLINE!"
else
    echo "❌ WARNING: Application may not have started correctly"
    echo "📋 Recent logs:"
    pm2 logs $DOMAIN --lines 20 --nostream
    exit 1
fi

echo "📊 PM2 Status:"
pm2 status

echo ""
echo "🔍 To view logs: pm2 logs $DOMAIN"
echo "🔍 To restart: pm2 restart $DOMAIN"
echo "🔍 To stop: pm2 stop $DOMAIN"