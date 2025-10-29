#!/bin/bash

# Server Database Reset Script
# WARNING: This will DELETE ALL DATA on the production server!

echo ""
echo "🚨 ========================================"
echo "   PRODUCTION DATABASE RESET"
echo "   ========================================"
echo ""
echo "⚠️  WARNING: This will DELETE ALL DATA on production server!"
echo "Server: root@159.223.220.101"
echo "Database: tg_isp"
echo ""
echo "Tables affected:"
echo "  • messages"
echo "  • conversation_embeddings"
echo "  • personalities"
echo "  • isp_queries"
echo "  • whitelisted_groups"
echo "  • whitelisted_numbers"
echo "  • bot_state"
echo ""

read -p "Type 'DELETE PRODUCTION DATABASE' to confirm: " confirmation

if [ "$confirmation" != "DELETE PRODUCTION DATABASE" ]; then
    echo ""
    echo "❌ Confirmation failed. Database reset cancelled."
    exit 0
fi

echo ""
read -p "⚠️  Are you ABSOLUTELY sure? Type 'YES DELETE EVERYTHING': " confirmation2

if [ "$confirmation2" != "YES DELETE EVERYTHING" ]; then
    echo ""
    echo "❌ Second confirmation failed. Database reset cancelled."
    exit 0
fi

echo ""
echo "🔄 Connecting to production server..."
echo ""

# Execute SQL commands on the server
ssh root@159.223.220.101 "sudo -u postgres psql -d tg_isp" <<'EOF'
-- Truncate all tables
TRUNCATE TABLE messages RESTART IDENTITY CASCADE;
TRUNCATE TABLE conversation_embeddings RESTART IDENTITY CASCADE;
TRUNCATE TABLE personalities RESTART IDENTITY CASCADE;
TRUNCATE TABLE isp_queries RESTART IDENTITY CASCADE;
TRUNCATE TABLE whitelisted_groups RESTART IDENTITY CASCADE;
TRUNCATE TABLE whitelisted_numbers RESTART IDENTITY CASCADE;
TRUNCATE TABLE bot_state RESTART IDENTITY CASCADE;

-- Seed default whitelist users
INSERT INTO whitelisted_numbers (user_identifier, whitelisted_by, notes)
VALUES
    ('+96170454176', 'system', 'Default whitelist - seeded by reset script'),
    ('+96170201076', 'system', 'Default whitelist - seeded by reset script'),
    ('+96170118353', 'system', 'Default whitelist - seeded by reset script'),
    ('+96170442737', 'system', 'Default whitelist - admin number')
ON CONFLICT (user_identifier) DO NOTHING;
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ ========================================"
    echo "   PRODUCTION DATABASE RESET COMPLETE!"
    echo "   ========================================"
    echo ""
    echo "Summary:"
    echo "  ✓ All tables truncated"
    echo "  ✓ 4 default numbers whitelisted"
    echo "  ✓ Production database is clean and ready"
    echo ""
    echo "⏳ Remember: VitoDeploy will auto-deploy when you push to main"
    echo "   Deployment takes ~2 minutes"
    echo ""
else
    echo ""
    echo "❌ Error during server database reset"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check SSH access: ssh root@159.223.220.101"
    echo "  2. Check database credentials in server .env"
    echo "  3. Check PostgreSQL is running: sudo systemctl status postgresql"
    exit 1
fi
