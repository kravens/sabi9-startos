#!/usr/bin/env python3
# sabi9d - Sabi9 web daemon: serves the UI and proxies JSON-RPC to the local
# Wasabi daemon (127.0.0.1:37128). Pure stdlib. The UI port (55569) is exposed
# through StartOS interfaces; the RPC port never leaves the container.
import json, os, re, sys, urllib.request, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UI_PORT = int(os.environ.get("SABI9_PORT", "55569"))
RPC_URL = os.environ.get("SABI9_RPC", "http://127.0.0.1:37128")
STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
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
