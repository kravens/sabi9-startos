#!/bin/sh
# Sabi9 entrypoint for the Wasabi daemon: guarantee the JSON-RPC server is
# enabled (bound to loopback only - reachable solely by the sabi9d web daemon
# in the same network namespace), then hand over to wassabeed.
#
# Why this is more than a one-line flag flip:
#   Wasabi 2.8.0 MIGRATES an unversioned Config.json to "ConfigVersion": 4 on
#   first load, and in doing so RESETS "JsonRpcServerEnabled" back to false and
#   rewrites the file WITH a UTF-8 BOM. So we (a) write a COMPLETE v4 config on
#   first boot - Wasabi then performs no migration and keeps our value - and
#   (b) read BOM-tolerantly (utf-8-sig) when re-checking an existing/user-edited
#   config every boot, forcing RPC back on. The fixup must never crash the
#   launch (a failed `set -e` here previously put the daemon in a restart loop).
set -u

export HOME=/data
CFG_DIR="$HOME/.walletwasabi/client"
CFG="$CFG_DIR/Config.json"
mkdir -p "$CFG_DIR"

python3 - "$CFG" <<'PYEOF' || echo "sabi9: WARNING config fixup failed; launching wassabeed anyway"
import json, os, sys

p = sys.argv[1]

# A complete ConfigVersion-4 config (matches what Wasabi 2.8.0 itself writes),
# with JSON-RPC enabled on loopback. Written verbatim on first boot so Wasabi
# does not migrate -> JsonRpcServerEnabled stays true.
default = {
    "CoordinatorUri": "",
    "UseTor": "Enabled",
    "TerminateTorOnExit": False,
    "TorBridges": [],
    "DownloadNewVersion": True,
    "BitcoinRpcCredentialString": "",
    "BitcoinRpcEndPoint": "",
    "JsonRpcServerEnabled": True,
    "JsonRpcUser": "",
    "JsonRpcPassword": "",
    "JsonRpcServerPrefixes": ["http://127.0.0.1:37128/", "http://localhost:37128/"],
    "DustThreshold": "0.00001",
    "EnableGpu": True,
    "CoordinatorIdentifier": "CoinJoinCoordinatorIdentifier",
    "ExchangeRateProvider": "MempoolSpace",
    "FeeRateEstimationProvider": "MempoolSpace",
    "ExternalTransactionBroadcaster": "MempoolSpace",
    "MaxCoinJoinMiningFeeRate": 50.0,
    "AbsoluteMinInputCount": 21,
    "MaxDaysInMempool": 30,
    "ExperimentalFeatures": [],
    "ConfigVersion": 4,
}

cfg = {}
if os.path.exists(p):
    try:
        with open(p, encoding="utf-8-sig") as f:   # tolerate Wasabi's UTF-8 BOM
            cfg = json.load(f)
    except Exception as e:
        print(f"sabi9: existing Config.json unreadable ({e}); rewriting from default", flush=True)
        cfg = {}

# Keep whatever the user/Wasabi set, but force RPC on and ensure the prefixes.
merged = dict(default)
merged.update(cfg)
merged["JsonRpcServerEnabled"] = True
if not merged.get("JsonRpcServerPrefixes"):
    merged["JsonRpcServerPrefixes"] = default["JsonRpcServerPrefixes"]
merged.setdefault("ConfigVersion", 4)

with open(p, "w", encoding="utf-8") as f:           # write WITHOUT a BOM
    json.dump(merged, f, indent=2)
print("sabi9: Config.json ready (JSON-RPC enabled on loopback)", flush=True)
PYEOF

exec /opt/wasabi/wassabeed
