#!/usr/bin/env python3
# sabi9d - Sabi9 web daemon: serves the UI and proxies JSON-RPC to the local
# Wasabi daemon (127.0.0.1:37128). Pure stdlib. The UI port (55569) is exposed
# through StartOS interfaces; the RPC port never leaves the container.
import json, os, re, socket, sys, time, urllib.request, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UI_PORT = int(os.environ.get("SABI9_PORT", "55569"))
RPC_URL = os.environ.get("SABI9_RPC", "http://127.0.0.1:37128")
STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
# both subcontainers mount the 'main' volume at /data, so the web daemon can
# edit the Wasabi config directly (daemon only reads it at startup -> restart)
WASABI_CFG = os.path.join(os.environ.get("HOME", "/data"), ".walletwasabi", "client", "Config.json")
MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
        ".json": "application/json", ".woff2": "font/woff2"}

# ---- QR encoder (byte mode, EC level L, versions 1-5, mask 0) ----------------------
_QR_CAP = {1: 17, 2: 32, 3: 53, 4: 78, 5: 106}
_QR_DCW = {1: 19, 2: 34, 3: 55, 4: 80, 5: 108}
_QR_ECW = {1: 7, 2: 10, 3: 15, 4: 20, 5: 26}
_QR_FMT0 = 0b111011111000100
_GF_EXP = [0]*512; _GF_LOG = [0]*256
_x = 1
for _i in range(255):
    _GF_EXP[_i] = _x; _GF_LOG[_x] = _i
    _x <<= 1
    if _x & 0x100: _x ^= 0x11d
for _i in range(255, 512): _GF_EXP[_i] = _GF_EXP[_i-255]

def _rs_ecc(data, ecw):
    gen = [1]
    for i in range(ecw):
        ng = [0]*(len(gen)+1)
        for j, g in enumerate(gen):
            ng[j] ^= g
            if g: ng[j+1] ^= _GF_EXP[(_GF_LOG[g] + i) % 255]
        gen = ng
    rem = list(data) + [0]*ecw
    for i in range(len(data)):
        f = rem[i]
        if f:
            for j in range(1, len(gen)):
                if gen[j]: rem[i+j] ^= _GF_EXP[(_GF_LOG[gen[j]] + _GF_LOG[f]) % 255]
        rem[i] = 0
    return rem[len(data):]

def qr_matrix(text):
    data = text.encode("utf-8")
    v = next((v for v in range(1, 6) if len(data) <= _QR_CAP[v]), None)
    if v is None: return None
    n = 17 + 4*v
    M = [[None]*n for _ in range(n)]
    def finder(r0, c0):
        for r in range(-1, 8):
            for c in range(-1, 8):
                rr, cc = r0+r, c0+c
                if 0 <= rr < n and 0 <= cc < n:
                    pat = 0 <= r <= 6 and 0 <= c <= 6 and (r in (0, 6) or c in (0, 6)
                          or (2 <= r <= 4 and 2 <= c <= 4))
                    M[rr][cc] = 1 if pat else 0
    finder(0, 0); finder(0, n-7); finder(n-7, 0)
    for i in range(8, n-8):
        if M[6][i] is None: M[6][i] = (i+1) % 2
        if M[i][6] is None: M[i][6] = (i+1) % 2
    if v >= 2:
        k = 4*v + 10
        for r in range(k-2, k+3):
            for c in range(k-2, k+3):
                M[r][c] = 1 if (r in (k-2, k+2) or c in (k-2, k+2) or (r == k and c == k)) else 0
    M[n-8][8] = 1
    fmt1 = [(8,0),(8,1),(8,2),(8,3),(8,4),(8,5),(8,7),(8,8),(7,8),
            (5,8),(4,8),(3,8),(2,8),(1,8),(0,8)]
    fmt2 = [(n-1,8),(n-2,8),(n-3,8),(n-4,8),(n-5,8),(n-6,8),(n-7,8),
            (8,n-8),(8,n-7),(8,n-6),(8,n-5),(8,n-4),(8,n-3),(8,n-2),(8,n-1)]
    for (r, c) in fmt1 + fmt2:
        if M[r][c] is None: M[r][c] = 0
    bits = []
    def push(val, cnt):
        for k2 in range(cnt-1, -1, -1): bits.append((val >> k2) & 1)
    push(4, 4); push(len(data), 8)
    for b in data: push(b, 8)
    push(0, min(4, _QR_DCW[v]*8 - len(bits)))
    while len(bits) % 8: bits.append(0)
    pi = 0
    while len(bits) < _QR_DCW[v]*8:
        push((0xEC, 0x11)[pi % 2], 8); pi += 1
    cw = [int("".join(map(str, bits[i:i+8])), 2) for i in range(0, len(bits), 8)]
    allcw = cw + _rs_ecc(cw, _QR_ECW[v])
    seq = []
    for c8 in allcw:
        for k2 in range(7, -1, -1): seq.append((c8 >> k2) & 1)
    idx = 0; col = n-1; up = True
    while col > 0:
        if col == 6: col -= 1
        rng = range(n-1, -1, -1) if up else range(n)
        for r in rng:
            for cc in (col, col-1):
                if M[r][cc] is None:
                    b = seq[idx] if idx < len(seq) else 0
                    idx += 1
                    if (r + cc) % 2 == 0: b ^= 1
                    M[r][cc] = b
        up = not up; col -= 2
    fbits = [(_QR_FMT0 >> (14-i)) & 1 for i in range(15)]
    for (rc, b) in zip(fmt1, fbits): M[rc[0]][rc[1]] = b
    for (rc, b) in zip(fmt2, fbits): M[rc[0]][rc[1]] = b
    return M

def qr_svg(text, quiet=4, scale=8):
    M = qr_matrix(text)
    if M is None: return None
    n = len(M); size = (n + 2*quiet) * scale
    cells = []
    for r in range(n):
        for c in range(n):
            if M[r][c]:
                cells.append(f'<rect x="{(c+quiet)*scale}" y="{(r+quiet)*scale}" '
                             f'width="{scale}" height="{scale}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
            f'width="{size}" height="{size}"><rect width="100%" height="100%" fill="#fff"/>'
            f'<g fill="#000">{"".join(cells)}</g></svg>')

# ---- RPC proxy ----------------------------------------------------------------------
def rpc_call(method, params, wallet=None, timeout=60):
    target = RPC_URL + ("/" + urllib.parse.quote(wallet) + "/" if wallet else "")
    body = json.dumps({"jsonrpc": "2.0", "id": "sabi9", "method": method,
                       "params": params if params is not None else []}).encode()
    req = urllib.request.Request(target, data=body,
        headers={"Content-Type": "text/plain;", "User-Agent": "sabi9/1.0"})
    user, pw = os.environ.get("WASABI_RPC_USER"), os.environ.get("WASABI_RPC_PASS")
    if user:
        import base64
        req.add_header("Authorization", "Basic " +
                       base64.b64encode(f"{user}:{pw or ''}".encode()).decode())
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode() or "{}")

# whitelist: exactly what the UI needs - nothing that could exfiltrate keys
ALLOWED = {"getstatus", "listwallets", "loadwallet", "getwalletinfo", "listunspentcoins",
           "gethistory", "getnewaddress", "getfeerates", "send", "build", "broadcast",
           "startcoinjoin", "stopcoinjoin", "startcoinjoinsweep", "payincoinjoin",
           "listpaymentsincoinjoin", "cancelpaymentincoinjoin", "excludefromcoinjoin",
           "speeduptransaction", "canceltransaction", "createwallet", "recoverwallet"}

# ---- settings (Config.json) ----------------------------------------------------------
# Wasabi ships WITHOUT a coordinator - the user picks one they trust (it batches the
# rounds, sees coinjoin activity and sets the coordination fee; it can never steal
# funds). Same model as sabi.py's coordinator picker.
KNOWN_COORDINATORS = [
    ("coinjoin.nl", "https://coinjoin.nl/",      "this project's coordinator"),
    ("kruw.io",     "https://coinjoin.kruw.io/", "well-known, long-running"),
]
LIQUISABI_API = "http://liquisabi.com/api"        # public round aggregator (as sabi.py)
# Start9 service hostnames a local Bitcoin Core would answer on (probe, never assume)
BITCOIND_CANDIDATES = (("bitcoind.embassy", 8332), ("bitcoind.startos", 8332),
                       ("bitcoind", 8332))

def read_wasabi_config():
    try:
        with open(WASABI_CFG, encoding="utf-8-sig") as f:   # tolerate Wasabi's UTF-8 BOM
            return json.load(f)
    except Exception:
        return {}

def edit_wasabi_config(updates):
    # edit ONLY the given keys: 2.8.0's strict loader deletes and re-defaults a
    # Config.json it cannot fully decode, so never write a fresh/partial file here
    cfg = read_wasabi_config()
    if not cfg:
        raise RuntimeError("Config.json not found - has the Wasabi daemon booted once?")
    cfg.update(updates)
    with open(WASABI_CFG, "w", encoding="utf-8") as f:      # write WITHOUT a BOM
        json.dump(cfg, f, indent=2)

def norm_coord_uri(s):                            # user text -> URI for Config.json (None = invalid)
    s = (s or "").strip()
    if s.lower() in ("", "none", "off", "clear"):
        return ""                                 # explicit: run without a coordinator
    if "://" not in s:
        s = "https://" + s
    try:
        u = urllib.parse.urlparse(s)
        host, _ = u.hostname, u.port              # .port raises on a malformed port
    except ValueError:
        return None
    if u.scheme not in ("http", "https") or not host: return None
    if not re.fullmatch(r"[a-z0-9]([a-z0-9.-]*[a-z0-9])?", host): return None
    if host.endswith("wasabiwallet.io"): return None   # daemon rejects the old zkSNACKs host
    return s if s.endswith("/") else s + "/"

# editable Config.json keys, Desktop-style Bitcoin/Coordinator/Privacy split.
# ⚠ Wasabi 2.8's strict loader re-defaults the ENTIRE config if it cannot decode a
# value, so enum-ish fields only accept values we know 2.8 ships (or the current one).
_PROVIDERS = {"MempoolSpace", "BlockstreamInfo"}
_USETOR = {"Enabled", "Disabled"}

def validate_settings(req, cfg):
    upd = {}
    def keep_or(allowed, key):                    # allow known values or the current one
        return set(allowed) | {cfg.get(key)} - {None}
    if "coordinatorUri" in req:
        uri = norm_coord_uri(str(req["coordinatorUri"] or ""))
        if uri is None: raise ValueError("invalid coordinator URI")
        upd["CoordinatorUri"] = uri
    if "maxCoinJoinMiningFeeRate" in req:
        try: v = float(req["maxCoinJoinMiningFeeRate"])
        except (TypeError, ValueError): raise ValueError("max mining fee rate must be a number")
        if not 1 <= v <= 1000: raise ValueError("max mining fee rate: 1-1000 sat/vB")
        upd["MaxCoinJoinMiningFeeRate"] = v
    if "absoluteMinInputCount" in req:
        try: v = int(req["absoluteMinInputCount"])
        except (TypeError, ValueError): raise ValueError("min input count must be a whole number")
        if not 2 <= v <= 400: raise ValueError("min input count: 2-400 (Wasabi default 21)")
        upd["AbsoluteMinInputCount"] = v
    if "bitcoinRpcEndPoint" in req:
        ep = str(req["bitcoinRpcEndPoint"] or "").strip()
        if ep and not re.fullmatch(r"[A-Za-z0-9._\-]+(:\d{1,5})?", ep):
            raise ValueError("endpoint must look like host:port")
        upd["BitcoinRpcEndPoint"] = ep
    if "bitcoinRpcCredentialString" in req:
        upd["BitcoinRpcCredentialString"] = str(req["bitcoinRpcCredentialString"] or "")
    if "dustThreshold" in req:
        v = str(req["dustThreshold"] or "").strip()
        if not re.fullmatch(r"\d+(\.\d{1,8})?", v) or not 0 <= float(v) <= 0.01:
            raise ValueError("dust threshold: BTC amount between 0 and 0.01")
        upd["DustThreshold"] = v
    if "maxDaysInMempool" in req:
        try: v = int(req["maxDaysInMempool"])
        except (TypeError, ValueError): raise ValueError("days in mempool must be a whole number")
        if not 1 <= v <= 90: raise ValueError("days in mempool: 1-90 (Wasabi default 30)")
        upd["MaxDaysInMempool"] = v
    if "useTor" in req:
        v = str(req["useTor"] or "")
        if v not in keep_or(_USETOR, "UseTor"): raise ValueError("Tor: Enabled or Disabled")
        upd["UseTor"] = v
    for jskey, ckey in (("exchangeRateProvider", "ExchangeRateProvider"),
                        ("feeRateEstimationProvider", "FeeRateEstimationProvider"),
                        ("externalTransactionBroadcaster", "ExternalTransactionBroadcaster")):
        if jskey in req:
            v = str(req[jskey] or "")
            if v not in keep_or(_PROVIDERS, ckey):
                raise ValueError(f"{jskey}: MempoolSpace or BlockstreamInfo")
            upd[ckey] = v
    if not upd: raise ValueError("nothing to save")
    return upd

_restart_flag = {}                                # web UI -> TS runtime restart bridge
_coord_cache = {"t": 0.0, "live": []}
def live_coordinators(days=14, n=100, timeout=8):
    # coordinators with recent PUBLIC rounds (best effort, cached 10 min). Carries no
    # wallet data - it is the same generic dashboard query sabi.py/txflow.py make.
    if time.monotonic() - _coord_cache["t"] < 600:
        return _coord_cache["live"]
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
    body = json.dumps({"jsonrpc": "2.0", "id": "1", "method": "dashboard", "params": {
        "since": (now - datetime.timedelta(days=days)).isoformat(), "until": now.isoformat(),
        "page": 1, "pageSize": n, "orderBy": "RoundEndTime", "descending": True,
        "searchTerm": ""}})
    req = urllib.request.Request(LIQUISABI_API, data=body.encode(),
        headers={"Content-Type": "text/plain;charset=UTF-8", "User-Agent": "sabi9/1.0",
                 "Origin": "http://liquisabi.com", "Referer": "http://liquisabi.com/"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        resp = json.loads(r.read().decode())
    rounds = ((resp.get("result") or resp).get("PaginatedRounds") or {}).get("Rounds") or []
    seen = {}
    for rd in rounds:
        ep = str(rd.get("CoordinatorEndpoint") or "").strip()
        if ep: seen[ep] = seen.get(ep, 0) + 1
    live = sorted(seen.items(), key=lambda kv: -kv[1])
    _coord_cache["t"], _coord_cache["live"] = time.monotonic(), live
    return live

# ---- hardware-wallet skeleton import (ColdCard / SeedSigner, fully offline) ----------
# There is no wassabeed RPC for this: like Wasabi Desktop we create the watch-only
# wallet FILE ourselves, in the daemon's Wallets directory (same 'main' volume).
_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

def _b58decode_check(s):
    import hashlib
    n = 0
    for ch in s:
        n = n * 58 + _B58.index(ch)
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big")
    raw = b"\x00" * (len(s) - len(s.lstrip("1"))) + raw
    data, chk = raw[:-4], raw[-4:]
    if hashlib.sha256(hashlib.sha256(data).digest()).digest()[:4] != chk:
        raise ValueError("bad base58 checksum")
    return data

def _b58encode_check(data):
    import hashlib
    data = data + hashlib.sha256(hashlib.sha256(data).digest()).digest()[:4]
    n = int.from_bytes(data, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = _B58[r] + out
    return "1" * (len(data) - len(data.lstrip(b"\x00"))) + out

# SLIP-132 version bytes -> the plain xpub/tpub Wasabi expects
_XPUB_VERS = {
    bytes.fromhex("0488b21e"): bytes.fromhex("0488b21e"),  # xpub
    bytes.fromhex("049d7cb2"): bytes.fromhex("0488b21e"),  # ypub
    bytes.fromhex("04b24746"): bytes.fromhex("0488b21e"),  # zpub
    bytes.fromhex("043587cf"): bytes.fromhex("043587cf"),  # tpub
    bytes.fromhex("044a5262"): bytes.fromhex("043587cf"),  # upub
    bytes.fromhex("045f1cf6"): bytes.fromhex("043587cf"),  # vpub
}

def normalize_xpub(s):
    data = _b58decode_check(str(s).strip())
    if len(data) != 78: raise ValueError("extended key must be 78 bytes")
    to = _XPUB_VERS.get(data[:4])
    if to is None: raise ValueError("unknown extended-key version (want xpub/ypub/zpub/tpub)")
    return _b58encode_check(to + data[4:])

def parse_skeleton(req):
    # returns (xpub, fingerprint). Accepts: ColdCard Wasabi skeleton
    # {ExtPubKey, MasterFingerprint}; ColdCard generic export {xfp, bip84:{xpub|_pub}};
    # or bare fields from the form (SeedSigner shows xpub + fingerprint as text).
    sk = req.get("skeleton")
    if isinstance(sk, str) and sk.strip():
        try: sk = json.loads(sk)
        except ValueError:
            sk = {"ExtPubKey": sk}                 # raw xpub pasted straight in
    sk = sk if isinstance(sk, dict) else {}
    xpub = (sk.get("ExtPubKey") or (sk.get("bip84") or {}).get("xpub")
            or (sk.get("bip84") or {}).get("_pub") or req.get("extPubKey") or "")
    fp = (sk.get("MasterFingerprint") or sk.get("xfp")
          or req.get("masterFingerprint") or "")
    xpub = normalize_xpub(xpub)
    fp = str(fp).strip().lower()
    if not re.fullmatch(r"[0-9a-f]{8}", fp):
        raise ValueError("master fingerprint must be 8 hex characters (e.g. 0f056943)")
    return xpub, fp

WALLET_NAME_RE = r"[A-Za-z0-9][A-Za-z0-9 _\-]{0,39}"   # filename-safe, no traversal

def _wallet_path_for(name):
    name = str(name or "").strip()
    if not re.fullmatch(WALLET_NAME_RE, name):
        raise ValueError("wallet name: letters, digits, space, - _ (max 40)")
    wdir = os.path.join(os.path.dirname(WASABI_CFG), "Wallets")
    os.makedirs(wdir, exist_ok=True)
    path = os.path.join(wdir, name + ".json")
    if os.path.exists(path): raise ValueError(f"wallet '{name}' already exists")
    return name, path

def _write_wallet(path, obj):
    with open(path, "w", encoding="utf-8") as f:   # write WITHOUT a BOM
        json.dump(obj, f, indent=2)

def _existing_wallet_path(name):
    name = str(name or "").strip()
    if not re.fullmatch(WALLET_NAME_RE, name):
        raise ValueError("bad wallet name")
    p = os.path.join(os.path.dirname(WASABI_CFG), "Wallets", name + ".json")
    if not os.path.isfile(p):
        raise ValueError(f"no wallet '{name}' on the daemon")
    return p

# per-WALLET settings live in the wallet file (no daemon RPC exists for them);
# edits apply after a daemon restart. The daemon rewrites wallet files itself,
# so a save between our edit and the restart can revert the value - harmless.
def read_wallet_settings(name):
    with open(_existing_wallet_path(name), encoding="utf-8-sig") as f:
        d = json.load(f)
    return {"anonScoreTarget": d.get("AnonScoreTarget", 10),
            "redCoinIsolation": bool(d.get("RedCoinIsolation", False)),
            "watchOnly": not d.get("EncryptedSecret")}

def set_wallet_anon_target(name, value):
    try: v = int(value)
    except (TypeError, ValueError): raise ValueError("anonymity target must be a whole number")
    if not 2 <= v <= 300: raise ValueError("anonymity target: 2-300 (Wasabi default 10)")
    p = _existing_wallet_path(name)
    with open(p, encoding="utf-8-sig") as f:
        d = json.load(f)
    d["AnonScoreTarget"] = v
    _write_wallet(p, d)
    return v

def is_full_wallet_file(obj):
    # a ⇓-exported (or Wasabi-written) wallet file, as opposed to a bare
    # ColdCard/SeedSigner skeleton - skeletons have none of these
    return isinstance(obj, dict) and (
        "HdPubKeys" in obj or "BlockchainState" in obj or bool(obj.get("EncryptedSecret")))

def restore_wallet_file(name, obj):
    # verbatim restore of a full wallet file: keys (encrypted), labels and anonymity
    # metadata all preserved. Only two mutations allowed: string heights -> ints
    # (defensive for exports from the broken-era importer; 2.8's decoder wants
    # numbers) and a network sanity check.
    if not obj.get("ExtPubKey"):
        raise ValueError("wallet file has no ExtPubKey - not a Wasabi wallet file")
    network = read_wasabi_config().get("Network", "Main")
    bs = obj.get("BlockchainState")
    if isinstance(bs, dict):
        wn = bs.get("Network")
        if wn and str(wn) != str(network):
            raise ValueError(f"wallet file is for network '{wn}' but the daemon runs '{network}'")
        for k in ("Height", "BirthHeight"):
            v = bs.get(k)
            if isinstance(v, str) and v.isdigit(): bs[k] = int(v)
    # a watch-only wallet has no key chain -> coinjoin throws an UNHANDLED
    # exception that SIGABRTs the whole daemon. Force AutoCoinJoin off so a
    # restored watch-only wallet can never auto-start a round on load.
    if not obj.get("EncryptedSecret"):
        obj["AutoCoinJoin"] = False
    name, path = _wallet_path_for(name)
    _write_wallet(path, obj)
    return name

def import_skeleton(name, xpub, fp):
    name, path = _wallet_path_for(name)
    network = read_wasabi_config().get("Network", "Main")
    testnet = str(network).lower() != "main"
    # matches 2.8.0's KeyManager JSON decoder EXACTLY (Decode.Object in KeyManager.cs):
    # required = ExtPubKey, BlockchainState, HdPubKeys; heights are JSON NUMBERS
    # (unlike the RPC's string heights!) - a string Height fails the UInt decode and
    # the daemon silently skips the "corrupted" wallet file at startup.
    birth = 0 if testnet else 481824               # SegWit activation: no P2WPKH predates it
    wallet = {
        "EncryptedSecret": None,                   # null + fingerprint = hardware watch-only
        "ChainCode": None,
        "MasterFingerprint": fp,
        "ExtPubKey": xpub,
        "MinGapLimit": 21,
        "AccountKeyPath": "84'/1'/0'" if testnet else "84'/0'/0'",
        "TaprootAccountKeyPath": "86'/1'/0'" if testnet else "86'/0'/0'",
        "BlockchainState": {"Network": network, "Height": birth, "BirthHeight": birth},
        "PreferPsbtWorkflow": True,
        "Icon": None,
        "ExcludedCoinsFromCoinJoin": [],
        "HdPubKeys": [],
    }
    _write_wallet(path, wallet)
    return name

def detect_bitcoind():
    # fixed candidate list + the configured endpoint - no arbitrary host:port from the
    # client, so the unauthenticated UI cannot be used as a port scanner
    cand = list(BITCOIND_CANDIDATES)
    ep = str(read_wasabi_config().get("BitcoinRpcEndPoint") or "").strip()
    if ep and ":" in ep:
        host, _, port = ep.rpartition(":")
        if port.isdigit(): cand.insert(0, (host, int(port)))
    found = []
    for host, port in cand:
        try:
            with socket.create_connection((host, port), timeout=1.5):
                found.append(f"{host}:{port}")
        except OSError:
            pass
    return found

class Handler(BaseHTTPRequestHandler):
    server_version = "sabi9/1.0"
    def log_message(self, fmt, *args):                # quiet: no per-request noise, no addresses
        pass

    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/health":
            return self._send(200, {"ok": True})
        if path == "/restart-pending":
            # read-once: consumed by the TS runtime's watcher (see main.ts)
            pending = _restart_flag.pop("pending", False)
            return self._send(200, {"restart": bool(pending)})
        if path == "/settings":
            cfg = read_wasabi_config()
            return self._send(200, {
                "coordinatorUri": cfg.get("CoordinatorUri", ""),
                "maxCoinJoinMiningFeeRate": cfg.get("MaxCoinJoinMiningFeeRate", 50),
                "absoluteMinInputCount": cfg.get("AbsoluteMinInputCount", 21),
                "bitcoinRpcEndPoint": cfg.get("BitcoinRpcEndPoint", ""),
                "bitcoinRpcCredentialSet": bool(cfg.get("BitcoinRpcCredentialString")),
                "network": cfg.get("Network", "Main"),
                "dustThreshold": cfg.get("DustThreshold", "0.00001"),
                "maxDaysInMempool": cfg.get("MaxDaysInMempool", 30),
                "useTor": cfg.get("UseTor", "Enabled"),
                "exchangeRateProvider": cfg.get("ExchangeRateProvider", "MempoolSpace"),
                "feeRateEstimationProvider": cfg.get("FeeRateEstimationProvider", "MempoolSpace"),
                "externalTransactionBroadcaster": cfg.get("ExternalTransactionBroadcaster", "MempoolSpace"),
                "configFound": bool(cfg),
            })
        if path == "/coordinators":
            try: live = live_coordinators()
            except Exception: live = []
            return self._send(200, {"known": KNOWN_COORDINATORS, "live": live})
        if path == "/detect-bitcoind":
            return self._send(200, {"found": detect_bitcoind()})
        if path == "/wallet-settings":
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            try:
                return self._send(200, read_wallet_settings((q.get("name") or [""])[0]))
            except ValueError as e:
                return self._send(400, {"error": str(e)})
        if path == "/export-wallet":
            # download the wallet FILE - the only backup that keeps labels + anonymity
            # metadata (recovery words alone restore funds, not privacy state). Hot
            # wallets carry only the password-encrypted secret, like Wasabi Desktop's
            # file backup; the UI's whole threat model already assumes LAN/Tor access.
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            name = (q.get("name") or [""])[0].strip()
            if not re.fullmatch(WALLET_NAME_RE, name):
                return self._send(400, {"error": "bad wallet name"})
            p = os.path.join(os.path.dirname(WASABI_CFG), "Wallets", name + ".json")
            if not os.path.isfile(p):
                return self._send(404, {"error": f"no wallet file for '{name}'"})
            data = open(p, "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Disposition", f'attachment; filename="{name}.json"')
            self.send_header("Content-Length", str(len(data)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(data)
            return
        if path == "/qr":
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            text = (q.get("text") or [""])[0][:200]
            svg = qr_svg(text) if text else None
            if svg is None: return self._send(400, {"error": "bad text"})
            return self._send(200, svg.encode(), "image/svg+xml")
        if path == "/": path = "/index.html"
        fp = os.path.normpath(os.path.join(STATIC, path.lstrip("/")))
        if not fp.startswith(STATIC) or not os.path.isfile(fp):
            return self._send(404, {"error": "not found"})
        ext = os.path.splitext(fp)[1]
        return self._send(200, open(fp, "rb").read(), MIME.get(ext, "application/octet-stream"))

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/wallet-settings":
            try:
                ln = int(self.headers.get("Content-Length") or 0)
                req = json.loads(self.rfile.read(min(ln, 100_000)).decode() or "{}")
                v = set_wallet_anon_target(req.get("name"), req.get("anonScoreTarget"))
                return self._send(200, {"ok": True, "anonScoreTarget": v, "restartRequired": True})
            except ValueError as e:
                return self._send(400, {"error": str(e)})
            except Exception as e:
                return self._send(502, {"error": str(e) or type(e).__name__})
        if path == "/restart-daemon":
            # requests a FULL service restart - identical to StartOS Dashboard →
            # Restart. We can't call StartOS from a subcontainer; instead the
            # package's TS runtime polls /restart-pending (shared loopback) and
            # calls effects.restart(). (The earlier RPC-'stop' approach only
            # killed wassabeed and did not reliably bring the service back.)
            _restart_flag["pending"] = True
            return self._send(200, {"ok": True})
        if path == "/import-skeleton":
            try:
                ln = int(self.headers.get("Content-Length") or 0)
                req = json.loads(self.rfile.read(min(ln, 1_000_000)).decode() or "{}")
                sk = req.get("skeleton")
                if isinstance(sk, str) and sk.strip():
                    try: sk = json.loads(sk)
                    except ValueError: sk = None
                if is_full_wallet_file(sk):
                    # ⇓ backup fed back in: RESTORE verbatim (keys/labels/anonscores
                    # intact) instead of stripping it to a watch-only skeleton
                    name = restore_wallet_file(req.get("name"), sk)
                    return self._send(200, {"ok": True, "name": name, "restored": True,
                                            "watchOnly": not sk.get("EncryptedSecret")})
                xpub, fp = parse_skeleton(req)
                name = import_skeleton(req.get("name"), xpub, fp)
                return self._send(200, {"ok": True, "name": name})
            except ValueError as e:
                return self._send(400, {"error": str(e)})
            except Exception as e:
                return self._send(502, {"error": str(e) or type(e).__name__})
        if path == "/settings":
            try:
                ln = int(self.headers.get("Content-Length") or 0)
                req = json.loads(self.rfile.read(min(ln, 100_000)).decode() or "{}")
                upd = validate_settings(req, read_wasabi_config())
                edit_wasabi_config(upd)
                return self._send(200, {"ok": True, "restartRequired": True})
            except ValueError as e:
                return self._send(400, {"error": str(e)})
            except Exception as e:
                return self._send(502, {"error": str(e) or type(e).__name__})
        if path != "/rpc":
            return self._send(404, {"error": "not found"})
        try:
            ln = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(min(ln, 1_000_000)).decode() or "{}")
            method = str(req.get("method") or "")
            if method not in ALLOWED:
                return self._send(403, {"error": f"method not allowed: {method}"})
            resp = rpc_call(method, req.get("params"), req.get("wallet") or None)
            return self._send(200, resp)
        except urllib.error.HTTPError as e:
            if e.code == 401:
                return self._send(502, {"error": "daemon requires RPC credentials "
                                        "(set WASABI_RPC_USER / WASABI_RPC_PASS)"})
            try: return self._send(200, json.loads(e.read().decode()))
            except Exception: return self._send(502, {"error": f"daemon HTTP {e.code}"})
        except Exception as e:
            return self._send(502, {"error": str(e) or type(e).__name__})

if __name__ == "__main__":
    srv = ThreadingHTTPServer(("0.0.0.0", UI_PORT), Handler)
    print(f"sabi9 web interface on :{UI_PORT}, proxying {RPC_URL}", flush=True)
    srv.serve_forever()
