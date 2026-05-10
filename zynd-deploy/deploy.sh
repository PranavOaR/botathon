#!/usr/bin/env bash
# FileMind — Zynd deployment script
# Builds the agent backend and registers it on Zynd deployer.
#
# Prerequisites:
#   - Railway CLI installed: npm install -g @railway/cli
#   - Logged in to Railway: railway login
#   - ZYND_API_KEY and ZYND_AGENT_ID set in agent/.env
#
# Usage:
#   cd zynd-deploy && bash deploy.sh

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_DIR="$REPO_ROOT/agent"

echo "==> Building agent..."
cd "$AGENT_DIR"
npm run build

echo "==> Deploying to Railway..."
railway up --service filemind-agent

echo "==> Fetching deployed URL..."
BACKEND_URL=$(railway domain 2>/dev/null || echo "")
if [ -z "$BACKEND_URL" ]; then
  echo "Could not auto-detect Railway URL."
  echo "Find your URL in the Railway dashboard and register it on Zynd manually:"
  echo "  https://deployer.zynd.ai"
  exit 0
fi

echo "==> Backend live at: https://$BACKEND_URL"

echo ""
echo "Next step — register on Zynd:"
echo "  1. Go to https://deployer.zynd.ai"
echo "  2. Select your agent"
echo "  3. Set endpoint URL to: https://$BACKEND_URL"
echo "  4. Set payment header to: x-payment"
echo "  5. Set price to: 0.01 USDC per request"
echo ""
echo "Done."
