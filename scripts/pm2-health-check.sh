#!/bin/bash
# PM2 Health Check Script
# Monitors app health and prevents infinite restart loops

APP_NAME="${1:-tg-isp.abiroot.dev}"
MAX_RESTARTS=50
CHECK_INTERVAL=60  # Check every 60 seconds

echo "🏥 PM2 Health Check for: $APP_NAME"
echo "======================================"

while true; do
    # Get PM2 app info
    APP_INFO=$(pm2 jlist 2>/dev/null)

    if [ -z "$APP_INFO" ] || [ "$APP_INFO" = "[]" ]; then
        echo "⚠️  [$(date)] No PM2 processes found"
        sleep $CHECK_INTERVAL
        continue
    fi

    # Extract restart count
    RESTARTS=$(echo "$APP_INFO" | jq -r ".[] | select(.name==\"$APP_NAME\") | .pm2_env.restart_time" 2>/dev/null)

    if [ -z "$RESTARTS" ]; then
        echo "⚠️  [$(date)] App $APP_NAME not found in PM2"
        sleep $CHECK_INTERVAL
        continue
    fi

    # Extract unstable restarts
    UNSTABLE=$(echo "$APP_INFO" | jq -r ".[] | select(.name==\"$APP_NAME\") | .pm2_env.unstable_restarts" 2>/dev/null)

    # Extract status
    STATUS=$(echo "$APP_INFO" | jq -r ".[] | select(.name==\"$APP_NAME\") | .pm2_env.status" 2>/dev/null)

    # Extract uptime
    UPTIME=$(echo "$APP_INFO" | jq -r ".[] | select(.name==\"$APP_NAME\") | .pm2_env.pm_uptime" 2>/dev/null)

    echo "[$(date)] Status: $STATUS | Restarts: $RESTARTS | Unstable: $UNSTABLE"

    # Check if app is in restart loop
    if [ "$RESTARTS" -gt "$MAX_RESTARTS" ]; then
        echo "🚨 [$(date)] ALERT: App has restarted $RESTARTS times (threshold: $MAX_RESTARTS)"
        echo "🛑 Stopping app to prevent resource exhaustion..."
        pm2 stop "$APP_NAME"

        echo "📋 Recent error logs:"
        pm2 logs "$APP_NAME" --err --lines 50 --nostream

        echo ""
        echo "❌ App stopped due to excessive restarts"
        echo "🔍 Check logs: pm2 logs $APP_NAME"
        echo "🔧 Fix the issue, then restart: pm2 restart $APP_NAME --update-env"

        break
    fi

    # Check if app is stuck in errored state
    if [ "$STATUS" = "errored" ]; then
        echo "⚠️  [$(date)] App is in errored state"
        echo "📋 Recent error logs:"
        pm2 logs "$APP_NAME" --err --lines 20 --nostream
    fi

    sleep $CHECK_INTERVAL
done
