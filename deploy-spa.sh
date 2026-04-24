#!/bin/bash
# deploy-spa.sh — Anamoria SPA Deployment Script
# v1.1 — PWA Conversion (April 23, 2026)
#
# PWA-aware deployment with per-file-type cache headers.
# Service worker and index.html are NEVER cached by CloudFront.
# Hashed assets are cached forever (immutable).
#
# Usage: ./deploy-spa.sh
# Prerequisites: AWS CLI configured, npm build completed (dist/ exists)

set -euo pipefail

BUCKET="anamoria-spa"
DISTRIBUTION_ID="E1AZ217DYA1ZQS"
DIST_DIR="dist"

echo "=========================================="
echo "  Anamoria SPA Deploy — PWA-aware v1.1"
echo "=========================================="
echo ""

# Verify dist exists
if [ ! -d "$DIST_DIR" ]; then
  echo "ERROR: $DIST_DIR directory not found. Run 'npm run build' first."
  exit 1
fi

# Verify sw.js exists (PWA build check)
if [ ! -f "$DIST_DIR/sw.js" ]; then
  echo "WARNING: sw.js not found in $DIST_DIR. Was vite-plugin-pwa configured?"
  echo "Proceeding anyway — non-PWA deploy."
fi

echo "Step 1/6: Hashed assets (cache forever)..."
aws s3 sync "$DIST_DIR/assets/" "s3://$BUCKET/assets/" \
  --cache-control "max-age=31536000, immutable" \
  --delete \
  --region us-east-1
echo "  Done."

echo ""
echo "Step 2/6: Service worker (never cache)..."
if [ -f "$DIST_DIR/sw.js" ]; then
  aws s3 cp "$DIST_DIR/sw.js" "s3://$BUCKET/sw.js" \
    --cache-control "no-cache, no-store, must-revalidate" \
    --region us-east-1
  echo "  Done."
else
  echo "  Skipped (no sw.js)."
fi

echo ""
echo "Step 3/6: Manifest (no-cache)..."
if [ -f "$DIST_DIR/manifest.webmanifest" ]; then
  aws s3 cp "$DIST_DIR/manifest.webmanifest" "s3://$BUCKET/manifest.webmanifest" \
    --cache-control "no-cache" \
    --content-type "application/manifest+json" \
    --region us-east-1
  echo "  Done."
else
  echo "  Skipped (no manifest.webmanifest)."
fi

echo ""
echo "Step 4/6: index.html (never cache)..."
aws s3 cp "$DIST_DIR/index.html" "s3://$BUCKET/index.html" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --region us-east-1
echo "  Done."

echo ""
echo "Step 5/6: Icons, images, and other static (24h cache)..."
aws s3 sync "$DIST_DIR/" "s3://$BUCKET/" \
  --exclude "assets/*" \
  --exclude "sw.js" \
  --exclude "index.html" \
  --exclude "manifest.webmanifest" \
  --cache-control "max-age=86400" \
  --delete \
  --region us-east-1
echo "  Done."

echo ""
echo "Step 6/6: CloudFront invalidation..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/index.html" "/sw.js" "/manifest.webmanifest" \
  --region us-east-1 \
  --query 'Invalidation.Id' \
  --output text)
echo "  Invalidation created: $INVALIDATION_ID"

echo ""
echo "=========================================="
echo "  Deploy complete."
echo "  Distribution: $DISTRIBUTION_ID"
echo "  Invalidation: $INVALIDATION_ID"
echo "=========================================="
echo ""
echo "Verify:"
echo "  1. Open https://d2ko7qv0y3xrsh.cloudfront.net"
echo "  2. DevTools → Application → Service Workers (should be registered)"
echo "  3. DevTools → Application → Manifest (should show Anamoria)"
echo "  4. DevTools → Lighthouse → PWA audit"
