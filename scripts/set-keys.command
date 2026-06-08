#!/bin/bash
# Double-click this (or run: bash scripts/set-keys.command) to paste your API
# keys into .env. Input is hidden. Leave a prompt blank to skip that key.
set -e
cd "$(dirname "$0")/.."
ENV=".env"
[ -f "$ENV" ] || cp .env.example "$ENV"

echo ""
echo "  Orbyt Verify — paste your API keys (input hidden; Enter to skip)"
echo "  ------------------------------------------------------------"
read -rsp "  IPQS API key:            " IPQS; echo
read -rsp "  Stripe SECRET (sk_...):  " STRIPE; echo
read -rsp "  Reality Defender key:    " RD; echo

setkey () { # name value
  [ -z "$2" ] && return 0
  /usr/bin/sed -i '' "s|^$1=.*|$1=\"$2\"|" "$ENV"
  echo "  ✓ $1 set (${#2} chars)"
}
setkey IPQS_API_KEY "$IPQS"
setkey STRIPE_SECRET_KEY "$STRIPE"
setkey REALITY_DEFENDER_API_KEY "$RD"

echo ""
echo "  Done. Keys written to $(pwd)/.env"
echo "  Switch back to Claude and say \"done\" to test them live."
echo ""
