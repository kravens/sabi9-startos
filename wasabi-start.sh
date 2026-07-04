#!/bin/sh
# Sabi9 entrypoint for the Wasabi daemon: ensure the JSON-RPC server is enabled
# (bound to loopback only - reachable solely by the web daemon in the same
# network namespace), then hand over to wassabeed.
set -eu

export HOME=/data
CFG_DIR="$HOME/.walletwasabi/client"
CFG="$CFG_DIR/Config.json"
mkdir -p "$CFG_DIR"

if [ ! -f "$CFG" ]; then
    cat > "$CFG" <<'EOF'
{
  "Network": "Main",
  "JsonRpcServerEnabled": true,
  "JsonRpcUser": "",
  "JsonRpcPassword": "",
  "JsonRpcServerPrefixes": [ "http://127.0.0.1:37128/" ]
}
EOF
    echo "sabi9: wrote initial Config.json (RPC enabled on loopback)"
else
    # user-managed config: only flip the RPC switch if it is off
    python3 - "$CFG" <<'PYEOF'
import json, sys
p = sys.argv[1]
cfg = json.load(open(p))
changed = False
if not cfg.get("JsonRpcServerEnabled"):
    cfg["JsonRpcServerEnabled"] = True; changed = True
if not cfg.get("JsonRpcServerPrefixes"):
    cfg["JsonRpcServerPrefixes"] = ["http://127.0.0.1:37128/"]; changed = True
if changed:
    json.dump(cfg, open(p, "w"), indent=2)
    print("sabi9: enabled JSON-RPC in existing Config.json")
PYEOF
fi

exec /opt/wasabi/wassabeed
