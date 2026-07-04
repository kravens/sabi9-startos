/* Sabi9 web app - Wasabi Desktop-style client for the Wasabi daemon (via /rpc proxy). */
"use strict";

const $ = (id) => document.getElementById(id);
const DEMO = new URLSearchParams(location.search).has("demo");

// ---------- state -------------------------------------------------------------------
const S = {
  wallets: [], wallet: localStorage.getItem("sabi9.wallet") || null,
  info: null, coins: [], history: [], fees: null, status: null,
  loading: false, cjOn: false, discreet: localStorage.getItem("sabi9.discreet") === "1",
};

// ---------- rpc ---------------------------------------------------------------------
async function rpc(method, params = [], wallet = undefined) {
  if (DEMO) return demoRpc(method, params, wallet);
  const r = await fetch("/rpc", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params, wallet }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || j.error);
  return j.result !== undefined ? j.result : j;
}

// ---------- formatting --------------------------------------------------------------
const fmtBtc = (sats) => {
  const s = (Math.abs(Number(sats)) / 1e8).toFixed(8);
  const [a, b] = s.split(".");
  return `${sats < 0 ? "-" : ""}${a}.${b.slice(0, 4)} ${b.slice(4)}`;
};
const fmtUsd = (sats) => {
  const xr = S.status && S.status.exchangeRate;
  return xr ? `≈ ${Math.round((sats / 1e8) * xr).toLocaleString()} USD` : "";
};
const anonOf = (c) => c.anonymityScore || c.anonymitySet || 1;
const target = () => (S.info && S.info.anonScoreTarget) || 5;
const isCj = (h) => !!(h.islikelycoinjoin || h.isLikelyCoinJoin ||
                       String(h.label || "").toLowerCase() === "coinjoin");

function toast(msg, err = false, ms = 3500) {
  const t = $("toast");
  t.textContent = msg; t.className = err ? "err" : ""; t.classList.remove("hidden");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.add("hidden"), ms);
}

// ---------- polling -----------------------------------------------------------------
async function poll() {
  try {
    S.status = await rpc("getstatus");
    if (!S.wallets.length) {
      const ws = await rpc("listwallets");
      S.wallets = (ws || []).map((w) => w.walletName || w);
    }
    if (S.wallet) {
      S.info = await rpc("getwalletinfo", [], S.wallet);
      if (S.info && S.info.loaded === false) {
        S.loading = true; S.coins = []; S.history = [];
      } else {
        S.loading = false;
        S.coins = (await rpc("listunspentcoins", [], S.wallet)) || [];
        let h = (await rpc("gethistory", [], S.wallet)) || [];
        if (!Array.isArray(h)) h = h.transactions || [];
        h.sort((a, b) => {                       // newest first, unconfirmed pinned
          const ha = parseInt(a.height) || 1 << 30, hb = parseInt(b.height) || 1 << 30;
          return hb - ha || String(b.datetime || "").localeCompare(String(a.datetime || ""));
        });
        S.history = h;
        try { S.fees = await rpc("getfeerates", [], S.wallet); } catch (e) {}
      }
      const cjs = String((S.info && S.info.coinjoinStatus) || "");
      S.cjOn = cjs !== "" && cjs.toLowerCase() !== "idle";
    }
    render();
  } catch (e) {
    $("syncNote").classList.remove("hidden");
    $("syncNote").textContent = "⚠ daemon unreachable: " + e.message;
  }
}

// ---------- render -------------------------------------------------------------------
function render() {
  document.body.classList.toggle("discreet", S.discreet);
  if (!S.wallet) { showWalletPicker(); return; }
  $("walletTitle").textContent = S.wallet;

  const note = $("syncNote");
  if (S.loading) {
    note.classList.remove("hidden");
    note.textContent = "⟳ wallet is synchronizing - matching block filters and downloading " +
      "matched blocks over P2P; balances appear when done.";
  } else note.classList.add("hidden");

  const tot = S.coins.reduce((a, c) => a + (c.amount || 0), 0);
  const priv = S.coins.filter((c) => anonOf(c) >= target())
                      .reduce((a, c) => a + (c.amount || 0), 0);
  $("cBalance").innerHTML = `${fmtBtc(tot)} <span class="btc">BTC</span>`;
  $("cBalanceUsd").textContent = fmtUsd(tot);
  const pct = tot ? Math.round((100 * priv) / tot) : 0;
  $("cPriv").textContent = `${pct} %`;
  $("privFill").style.width = pct + "%";
  $("cPrivBtc").textContent = fmtBtc(priv) + " BTC";
  const xr = S.status && S.status.exchangeRate;
  $("cRate").innerHTML = xr
    ? `${Math.round(xr).toLocaleString().replace(/,/g, " ")} <span class="btc">USD</span>` : "—";

  // transactions
  const tb = $("txBody"); tb.innerHTML = "";
  $("txCount").textContent = S.history.length ? `(${S.history.length})` : "";
  for (const h of S.history.slice(0, 200)) {
    const tr = document.createElement("tr");
    const amt = h.amount || 0;
    const conf = parseInt(h.height) ? `block ${parseInt(h.height).toLocaleString()}` : "pending";
    const cj = isCj(h);
    tr.innerHTML =
      `<td class="ic">${parseInt(h.height) ? "✓" : "⌛"} ${cj ? '<span class="cj">◆</span>' : "⇄"}</td>` +
      `<td class="date">${String(h.datetime || "").slice(0, 10)}</td>` +
      `<td class="amt ${amt > 0 ? "pos" : ""}">${amt > 0 ? "+" : ""}${fmtBtc(amt)} BTC</td>` +
      `<td class="lbl">${cj ? '<span class="chip">coinjoin</span>'
        : (h.label ? `<span class="chip">${esc(String(h.label))}</span>` : "")}</td>` +
      `<td class="conf ${parseInt(h.height) ? "" : "unconf"}">${conf}</td>`;
    tr.title = h.tx || "";
    tr.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(h.tx || "");
                         toast("txid copied"); };
    tb.appendChild(tr);
  }

  // music box
  const mb = $("musicbox");
  mb.classList.remove("hidden");
  mb.classList.toggle("mixing", S.cjOn);
  $("mbStatus").textContent = S.cjOn
    ? ((S.info && S.info.coinjoinStatus) === "In critical phase"
        ? "Signing the coinjoin ..." : "Awaiting other participants")
    : "Coinjoin is idle";
  const np = S.coins.filter((c) => anonOf(c) < target())
                    .reduce((a, c) => a + (c.amount || 0), 0);
  $("mbSub").textContent = S.cjOn ? `mixing · ${fmtBtc(np)} BTC still non-private`
    : (np ? `${fmtBtc(np)} BTC could be made private` : "everything is private ◆");
  $("mbToggle").textContent = S.cjOn ? "Pause" : "Start";
}

const esc = (s) => s.replace(/[&<>"']/g, (m) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

// ---------- dialogs -------------------------------------------------------------------
function openDialog(html) {
  $("dialog").innerHTML = html;
  $("overlay").classList.remove("hidden");
}
function closeDialog() { $("overlay").classList.add("hidden"); }
$("overlay").addEventListener("click", (e) => { if (e.target.id === "overlay") closeDialog(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDialog(); });

// wallet picker
function showWalletPicker() {
  const rows = S.wallets.map((w) =>
    `<div class="wrow" data-w="${esc(w)}"><span class="dot">●</span> ${esc(w)}
     <span class="tag">open →</span></div>`).join("") ||
    "<p style='color:var(--dim)'>No wallets found on the daemon yet ...</p>";
  openDialog(`<h2>Select a wallet</h2>${rows}`);
  document.querySelectorAll(".wrow").forEach((r) => {
    r.onclick = async () => {
      const w = r.dataset.w;
      try { await rpc("loadwallet", [w]); } catch (e) {}
      S.wallet = w; localStorage.setItem("sabi9.wallet", w);
      closeDialog(); toast(`loading ${w} ...`); poll();
    };
  });
}

// ---------- send + preview (change avoidance) -----------------------------------------
function feeRate(blocks = 6) {
  const f = S.fees || {};
  const ks = Object.keys(f).map(Number).filter((n) => !isNaN(n)).sort((a, b) => a - b);
  if (!ks.length) return 5;
  const k = ks.reduce((p, c) => (Math.abs(c - blocks) < Math.abs(p - blocks) ? c : p));
  return Number(f[k]) || 5;
}

// bounded subset-sum: coin combos that pay `total` exactly (no change output)
function changeless(total) {
  const coins = S.coins.filter((c) => c.confirmed !== false);
  const rate = feeRate();
  const fee = (n) => Math.round(rate * (11 + 68 * n + 31));
  const vals = coins.map((c, i) => [c.amount || 0, i]).sort((a, b) => b[0] - a[0]).slice(0, 40);
  const UP = Math.round(total * 0.02) + 2000, DN = Math.round(total * 0.05) + 2000;
  let up = null, dn = null, budget = 80000;
  (function dfs(idx, cur, picked, rem) {
    if (budget-- <= 0) return;
    const n = picked.length;
    if (n) {
      const d = cur - fee(n) - total;
      if (d >= 0 && d <= UP && (!up || d < up.d)) up = { d, picked: [...picked], sum: cur };
      if (d < 0 && d >= -DN && (!dn || d > dn.d)) dn = { d, picked: [...picked], sum: cur };
    }
    if (idx >= vals.length || n >= 25) return;
    if (cur + rem < total - DN) return;
    if (n && cur - fee(n) - total > UP) return;
    const [v, ci] = vals[idx];
    dfs(idx + 1, cur + v, (picked.push(ci), picked), rem - v); picked.pop();
    dfs(idx + 1, cur, picked, rem - v);
  })(0, 0, [], vals.reduce((a, [v]) => a + v, 0));
  const mk = (h) => h && { delta: h.d, sum: h.sum, coins: h.picked.map((i) => coins[i]) };
  return { up: mk(up), dn: mk(dn) };
}

function showSend() {
  openDialog(`
    <h2><span class="back" onclick="closeDialog()">←</span> Send</h2>
    <div class="frow"><label>ADDRESS</label><input id="sAddr" placeholder="bc1q..." spellcheck="false"></div>
    <div class="frow"><label>AMOUNT (BTC)</label><input id="sAmt" placeholder="0.001"></div>
    <div class="frow"><label>RECIPIENT / LABEL (required by Wasabi)</label><input id="sLbl" placeholder="who receives this?"></div>
    <div class="drow"><button class="abtn" onclick="closeDialog()">Cancel</button>
    <button class="abtn primary" id="sNext">Preview →</button></div>`);
  $("sNext").onclick = () => {
    const addr = $("sAddr").value.trim();
    const amt = Math.round(parseFloat($("sAmt").value) * 1e8);
    const lbl = $("sLbl").value.trim();
    if (!/^(bc1|tb1|bcrt1|[13mn2])[0-9a-zA-Z]{20,90}$/.test(addr)) return toast("that doesn't look like a bitcoin address", true);
    if (!amt || amt <= 0) return toast("enter a positive amount", true);
    if (!lbl) return toast("Wasabi requires a label - who receives this?", true);
    showPreview({ addr, amt, lbl });
  };
}

function showPreview(p) {
  const rate = feeRate();
  const T = target();
  const sug = changeless(p.amt);
  // default coin selection: private first (mirrors sabi.py pick_coins)
  const need = p.amt + Math.max(5000, Math.round(p.amt * 0.003));
  const groups = [
    S.coins.filter((c) => anonOf(c) >= T),
    S.coins.filter((c) => anonOf(c) > 1 && anonOf(c) < T),
    S.coins.filter((c) => anonOf(c) <= 1)];
  let picked = [], have = 0;
  for (const g of groups) {
    for (const c of g.sort((a, b) => (b.amount || 0) - (a.amount || 0))) {
      if (have >= need) break;
      picked.push(c); have += c.amount || 0;
    }
    if (have >= need) break;
  }
  const vsize = 11 + 68 * picked.length + 31 * 2;
  const estFee = Math.round(rate * vsize);
  const labels = new Set(picked.map((c) => String(c.label || "")).filter(Boolean));
  const usesNp = picked.some((c) => anonOf(c) <= 1);
  const toxic = usesNp && picked.some((c) => anonOf(c) >= T);
  let chosen = null;                                 // no-change selection, if user picks one

  const warnChips = () => {
    const w = [];
    if (chosen) w.push(`<div class="wchip good"><span class="wi">◆</span>
      <span>No change output - this transaction consumes its coins exactly. Nothing links back.</span></div>`);
    else w.push(`<div class="wchip info"><span class="wi">ⓘ</span><span>Transaction creates change.</span></div>`);
    if (toxic) w.push(`<div class="wchip warn"><span class="wi">⚠</span>
      <span>Transaction merges private + non-private coins - this undoes their mix.</span></div>`);
    else if (usesNp) w.push(`<div class="wchip warn"><span class="wi">⚠</span>
      <span>Transaction uses non-private coins.</span></div>`);
    if (labels.size > 1) w.push(`<div class="wchip warn"><span class="wi">⚠</span>
      <span>Transaction interlinks labels: ${esc([...labels].slice(0, 3).join(", "))}</span></div>`);
    return w.join("");
  };
  const sugBtns = () => {
    if (chosen) return "";
    let h = "";
    if (sug.up) h += `<button class="sugbtn up" id="sugUp"><span class="si">▲</span>
      <span><b>Change Avoidance</b><br>Send <b>more</b> by ${sug.up.delta.toLocaleString()} sats
      (${fmtUsd(sug.up.delta)}) → no change output</span></button>`;
    if (sug.dn) h += `<button class="sugbtn down" id="sugDn"><span class="si">▼</span>
      <span><b>Change Avoidance</b><br>Send <b>less</b> by ${Math.abs(sug.dn.delta).toLocaleString()} sats
      (${fmtUsd(-sug.dn.delta)}) → no change output</span></button>`;
    return h ? `<div class="improve">IMPROVE THIS TRANSACTION:</div>${h}` : "";
  };

  const draw = () => {
    const amt = chosen ? p.amt + chosen.delta : p.amt;
    const useCoins = chosen ? chosen.coins : picked;
    const fee = chosen ? Math.max(0, chosen.sum - amt) : estFee;
    openDialog(`
      <h2><span class="back" id="pvBack">←</span> Preview Transaction</h2>
      <div id="pvGrid">
        <div id="pvFacts">
          <div class="fact"><span class="fi">₿</span><span class="fk">Amount</span>
            <span class="fv">${fmtBtc(amt)} BTC (${fmtUsd(amt)})</span></div>
          <div class="fact"><span class="fi">⇄</span><span class="fk">Address</span>
            <span class="fv">${esc(p.addr)}</span></div>
          <div class="fact"><span class="fi">◔</span><span class="fk">Recipient</span>
            <span class="fv">${esc(p.lbl)}</span></div>
          <div class="fact"><span class="fi">⏲</span><span class="fk">Expected confirmation time</span>
            <span class="fv">≈ 60 minutes (6 blocks)</span></div>
          <div class="fact"><span class="fi">▤</span><span class="fk">Fee${chosen ? "" : " (estimate)"}</span>
            <span class="fv">${fmtBtc(fee)} BTC (${fmtUsd(fee)}) · ${useCoins.length} coins in</span></div>
          <div class="frow" style="margin-top:16px"><label>WALLET PASSWORD</label>
            <input id="pvPw" type="password"></div>
          <div class="drow"><button class="abtn" onclick="closeDialog()">Cancel</button>
            <button class="abtn primary" id="pvConfirm">Confirm</button></div>
        </div>
        <div id="pvWarn">${warnChips()}${sugBtns()}</div>
      </div>`);
    $("pvBack").onclick = showSend;
    if ($("sugUp")) $("sugUp").onclick = () => { chosen = sug.up; draw(); };
    if ($("sugDn")) $("sugDn").onclick = () => { chosen = sug.dn; draw(); };
    $("pvConfirm").onclick = async () => {
      const pw = $("pvPw").value;
      const pays = [{ sendto: p.addr, amount: chosen ? chosen.sum : p.amt, label: p.lbl }];
      if (chosen) pays[0].subtractFee = true;        // consume the subset to zero: no change
      const coins = (chosen ? chosen.coins : picked)
        .map((c) => ({ transactionid: c.txid, index: c.index }));
      try {
        $("pvConfirm").disabled = true;
        const r = await rpc("send", { payments: pays, coins, feeTarget: 6, password: pw }, S.wallet);
        closeDialog(); toast("sent ✓  txid " + String((r && r.txid) || "").slice(0, 16) + "…");
        poll();
      } catch (e) { toast("✗ " + e.message, true, 6000); $("pvConfirm").disabled = false; }
    };
  };
  draw();
}

// ---------- receive --------------------------------------------------------------------
function showReceive() {
  openDialog(`
    <h2><span class="back" onclick="closeDialog()">←</span> Receive</h2>
    <div class="frow"><label>LABEL (who is paying you? required)</label>
      <input id="rvLbl" placeholder="e.g. alice"></div>
    <div class="drow"><button class="abtn primary" id="rvGo">Get address</button></div>`);
  $("rvGo").onclick = async () => {
    const lbl = $("rvLbl").value.trim();
    if (!lbl) return toast("Wasabi requires a label", true);
    try {
      const r = await rpc("getnewaddress", [lbl], S.wallet);
      const addr = (r && r.address) || String(r);
      openDialog(`
        <h2><span class="back" onclick="closeDialog()">←</span> Receive · ${esc(lbl)}</h2>
        <div id="qrWrap">
          <img src="/qr?text=${encodeURIComponent(addr)}" alt="QR">
          <div style="flex:1">
            <div class="improve">ADDRESS - CLICK TO COPY</div>
            <div id="rvAddr">${esc(addr)}</div>
            <p style="color:var(--dim);font-size:12.5px;margin-top:14px">
              One address, one use - never reuse it.</p>
          </div>
        </div>`);
      $("rvAddr").onclick = () => { navigator.clipboard.writeText(addr); toast("address copied ✓"); };
    } catch (e) { toast("✗ " + e.message, true); }
  };
}

// ---------- coinjoin --------------------------------------------------------------------
function showCoinjoin() {
  const np = S.coins.filter((c) => anonOf(c) < target()).reduce((a, c) => a + (c.amount || 0), 0);
  openDialog(`
    <h2><span class="back" onclick="closeDialog()">←</span> Coinjoin</h2>
    <div class="fact"><span class="fi">◆</span><span class="fk">Status</span>
      <span class="fv">${esc(String((S.info && S.info.coinjoinStatus) || "Idle"))}</span></div>
    <div class="fact"><span class="fi">₿</span><span class="fk">Still non-private</span>
      <span class="fv">${fmtBtc(np)} BTC</span></div>
    <div class="frow" style="margin-top:16px"><label>WALLET PASSWORD</label>
      <input id="cjPw" type="password"></div>
    <div class="drow">
      <button class="abtn" id="cjStop">Stop</button>
      <button class="abtn primary" id="cjStart">Start coinjoin</button>
    </div>
    <p style="color:var(--dim);font-size:12px;margin-top:10px">
      Start mixes until everything reaches your anonymity target (${target()}), then stops.
      The W in the bottom bar breathes green while mixing.</p>`);
  $("cjStart").onclick = async () => {
    try { await rpc("startcoinjoin", [$("cjPw").value, true, true], S.wallet);
          closeDialog(); toast("coinjoin started ◆"); poll(); }
    catch (e) { toast("✗ " + e.message, true); }
  };
  $("cjStop").onclick = async () => {
    try { await rpc("stopcoinjoin", [], S.wallet); closeDialog(); toast("coinjoin stopped"); poll(); }
    catch (e) { toast("✗ " + e.message, true); }
  };
}

// ---------- wire up -----------------------------------------------------------------------
$("btnSend").onclick = showSend;
$("btnReceive").onclick = showReceive;
$("btnCoinjoin").onclick = showCoinjoin;
$("navCoinjoin").onclick = showCoinjoin;
$("navWallets").onclick = showWalletPicker;
$("navRefresh").onclick = () => { toast("refreshing ..."); poll(); };
$("navDiscreet").onclick = () => {
  S.discreet = !S.discreet;
  localStorage.setItem("sabi9.discreet", S.discreet ? "1" : "0");
  toast(S.discreet ? "discreet mode on" : "discreet mode off");
  render();
};
$("mbToggle").onclick = () => (S.cjOn ? rpc("stopcoinjoin", [], S.wallet).then(poll) : showCoinjoin());
$("mbStop").onclick = () => rpc("stopcoinjoin", [], S.wallet).then(() => { toast("coinjoin stopped"); poll(); });

// ---------- demo mode (preview without a daemon) -------------------------------------------
function demoRpc(method, params, wallet) {
  const W = ["Alice's Wallet", "ColdVault"];
  const coins = [];
  let seed = 21;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let i = 0; i < 14; i++)
    coins.push({ txid: "f".repeat(64), index: i, amount: Math.round(rnd() * 2e7) + 5e4,
      anonymityScore: [1, 1, 2, 5, 8, 21, 55][i % 7], confirmed: true,
      label: ["kraken", "zonda", "", "salary"][i % 4] });
  const hist = [];
  for (let i = 0; i < 16; i++)
    hist.push({ datetime: `2026-0${(i % 6) + 1}-1${i % 9}T10:00:00`, height: i < 2 ? "Mempool" : String(902000 - i * 30),
      amount: (i % 3 ? -1 : 1) * (Math.round(rnd() * 5e6) + 1e5),
      label: i % 4 === 1 ? "coinjoin" : ["Person 3", "", "rent"][i % 3],
      tx: "e".repeat(64), islikelycoinjoin: i % 4 === 1 });
  const m = {
    getstatus: { exchangeRate: 66186, torStatus: "Running", peers: [1, 2, 3] },
    listwallets: W.map((w) => ({ walletName: w })),
    getwalletinfo: { walletName: wallet, loaded: true, anonScoreTarget: 5, coinjoinStatus: "Idle",
                     balance: coins.reduce((a, c) => a + c.amount, 0) },
    listunspentcoins: coins, gethistory: hist,
    getfeerates: { 2: 12, 6: 7, 144: 1 },
    getnewaddress: { address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4" },
    loadwallet: null, startcoinjoin: null, stopcoinjoin: null,
    send: { txid: "d".repeat(64) },
  };
  if (!(method in m)) throw new Error("demo: " + method);
  return Promise.resolve(m[method]);
}

// go
poll();
setInterval(poll, 5000);
