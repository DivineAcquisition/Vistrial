#!/bin/sh
# Vercel build: push Convex functions, then build Next.js against that deployment.
#
# The Convex CLI only reads CONVEX_DEPLOY_KEY. Production keeps its key in
# CONVEX_PROD_DEPLOY_KEY, which is also exposed to previews, so it is used only
# when Vercel is building production. Previews must never deploy to prod.
set -eu

if [ "${VERCEL_ENV:-}" = "production" ] && [ -z "${CONVEX_DEPLOY_KEY:-}" ]; then
  CONVEX_DEPLOY_KEY="${CONVEX_PROD_DEPLOY_KEY:-}"
fi

if [ -z "${CONVEX_DEPLOY_KEY:-}" ]; then
  echo "No Convex deploy key for VERCEL_ENV=${VERCEL_ENV:-unset}." >&2
  echo "Set CONVEX_DEPLOY_KEY (or CONVEX_PROD_DEPLOY_KEY for production) in Vercel." >&2
  exit 1
fi

if [ "${VERCEL_ENV:-}" = "production" ]; then
  case "$CONVEX_DEPLOY_KEY" in
    prod:*) ;;
    *)
      echo "The production build has a Convex deploy key that is not a prod: key." >&2
      exit 1
      ;;
  esac
fi

export CONVEX_DEPLOY_KEY
exec npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
