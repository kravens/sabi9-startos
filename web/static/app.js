/* Sabi9 web app - Wasabi Desktop-style client for the Wasabi daemon (via /rpc proxy). */
"use strict";

const $ = (id) => document.getElementById(id);
const DEMO = new URLSearchParams(location.search).has("demo");

// ---------- state -------------------------------------------------------------------
const S = {
  wallets: [], wallet: localStorage.getItem("sabi9.wallet") || null,
  walletsKnown: false,      // true once the daemon answered listwallets (drives welcome)
  unlocked: {},             // wallet -> password, session-only, NEVER persisted
  info: null, coins: [], history: [], fees: null, status: null,
  loading: false, cjOn: false, discreet: localStorage.getItem("sabi9.discreet") === "1",
};
const pwOf = () => S.unlocked[S.wallet] || "";

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

// non-RPC endpoints on sabi9d (settings / coordinator list / bitcoind probe)
async function api(path, body = undefined) {
  if (DEMO) return demoApi(path, body);
  const r = await fetch(path, body === undefined ? undefined : {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j;
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

// daemon errors -> human explanations (the raw ones confuse: "There is no wallet
// loaded" really means the async load / filter matching hasn't finished yet)
function friendly(e) {
  const m = String((e && e.message) || e);
  if (/no wallet loaded/i.test(m))
    return "wallet is still loading - the daemon is matching block filters; try again in a moment";
  if (/no coordinator/i.test(m))
    return "no coinjoin coordinator configured - choose one in Settings ⚙";
  return m;
}

function toast(msg, err = false, ms = 3500) {
  const t = $("toast");
  t.textContent = msg; t.className = err ? "err" : ""; t.classList.remove("hidden");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.add("hidden"), ms);
}

// ---------- polling -----------------------------------------------------------------
async function poll() {
  try {
    S.status = await rpc("getstatus");
    const ws = await rpc("listwallets");
    S.wallets = (ws || []).map((w) => w.walletName || w);
    S.walletsKnown = true;    // daemon is up and answered - welcome/sidebar can decide
    if (S.wallet) {
      try {
        S.info = await rpc("getwalletinfo", [], S.wallet);
        S.noCoord = false; S.walletMissing = false;
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
      } catch (e) {
        // 2.8.0: getwalletinfo throws without a coordinator; async load throws too
        const m = String(e.message || e).toLowerCase();
        if (m.includes("no coordinator")) { S.noCoord = true; S.loading = false; }
        else if (m.includes("no wallet loaded")) { S.loading = true; }
        else if (m.includes("not found")) { S.walletMissing = true; S.loading = false; }
        else throw e;
      }
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

  // status strip: tor / chain height / network (from getstatus)
  const st = S.status || {};
  const torOk = String(st.torStatus || "").toLowerCase().startsWith(("running"));
  $("statusline").innerHTML = st.bestBlockchainHeight
    ? `<span class="dot ${torOk ? "on" : "off"}">●</span> Tor · ` +
      `#${Number(st.bestBlockchainHeight).toLocaleString()} · ${esc(String(st.network || ""))}`
    : "";

  renderSidebar();

  // screen state: welcome (daemon answered, zero wallets) / pick-a-wallet / dashboard
  const show = (id, on) => $(id).classList.toggle("hidden", !on);
  if (!S.wallet) {
    show("dashboard", false); $("musicbox").classList.add("hidden");
    show("welcome", S.walletsKnown && !S.wallets.length);
    show("emptyState", S.walletsKnown && S.wallets.length > 0);
    return;
  }
  show("welcome", false); show("emptyState", false); show("dashboard", true);
  const wo = !!(S.info && S.info.isWatchOnly);
  $("walletTitle").innerHTML = esc(S.wallet) +
    (wo ? ' <span class="wobadge">◇ watch-only</span>' : "");

  // while the wallet is loading the daemon rejects wallet RPCs ("There is no
  // wallet loaded") - grey the actions out instead of letting them fail raw
  const busy = S.loading || S.walletMissing;
  $("btnSend").disabled = busy;
  $("btnReceive").disabled = busy;
  $("mbToggle").disabled = busy;
  $("mbStop").disabled = busy;

  const note = $("syncNote");
  const fleft = Number(st.filtersLeft || 0);
  if (S.walletMissing) {
    note.classList.remove("hidden");
    note.textContent = `⚠ wallet '${S.wallet}' is not on the daemon (yet) - a freshly ` +
      "imported wallet appears after a service restart. Or pick another wallet in the sidebar.";
  } else if (S.noCoord) {
    note.classList.remove("hidden");
    note.innerHTML = "⚠ No coinjoin coordinator configured - coinjoin is disabled. " +
      '<a id="fixCoord">Choose one in Settings →</a>';
    $("fixCoord").onclick = showSettings;
  } else if (S.loading) {
    note.classList.remove("hidden");
    note.textContent = "⟳ wallet is synchronizing - matching block filters and downloading " +
      "matched blocks over P2P; balances appear when done.";
  } else if (fleft > 0) {
    note.classList.remove("hidden");
    note.textContent = `⟳ syncing block filters - ${fleft.toLocaleString()} to go`;
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
    const pending = !parseInt(h.height);
    const conf = pending ? "pending" : `block ${parseInt(h.height).toLocaleString()}`;
    const cj = isCj(h);
    const acts = pending && h.tx
      ? ` <button class="txa" data-a="speed" title="Speed up (RBF/CPFP)">⚡</button>` +
        (amt < 0 ? `<button class="txa" data-a="cancel" title="Cancel (double-spend back to yourself)">✕</button>` : "")
      : "";
    tr.innerHTML =
      `<td class="ic">${pending ? "⌛" : "✓"} ${cj ? '<span class="cj">◆</span>' : "⇄"}</td>` +
      `<td class="date">${String(h.datetime || "").slice(0, 10)}</td>` +
      `<td class="amt ${amt > 0 ? "pos" : ""}">${amt > 0 ? "+" : ""}${fmtBtc(amt)} BTC</td>` +
      `<td class="lbl">${cj ? '<span class="chip">coinjoin</span>'
        : (h.label ? `<span class="chip">${esc(String(h.label))}</span>` : "")}</td>` +
      `<td class="conf ${pending ? "unconf" : ""}">${conf}${acts}</td>`;
    tr.title = h.tx || "";
    tr.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(h.tx || "");
                         toast("txid copied"); };
    tr.querySelectorAll(".txa").forEach((b) => b.onclick = (ev) => {
      ev.stopPropagation(); showTxFix(b.dataset.a, h.tx);
    });
    tb.appendChild(tr);
  }

  // music box: green pulse while in a round, amber pulse while signing/broadcasting
  const mb = $("musicbox");
  mb.classList.remove("hidden");
  const cjs2 = String((S.info && S.info.coinjoinStatus) || "");
  const critical = S.cjOn && /critical/i.test(cjs2);
  mb.classList.toggle("mixing", S.cjOn && !critical);
  mb.classList.toggle("critical", critical);
  $("mbStatus").textContent = S.cjOn
    ? (critical ? "Signing the coinjoin - do not stop the service"
                : "Awaiting other participants")
    : "Coinjoin is idle";
  const np = S.coins.filter((c) => anonOf(c) < target())
                    .reduce((a, c) => a + (c.amount || 0), 0);
  $("mbSub").textContent = S.cjOn ? `mixing · ${fmtBtc(np)} BTC still non-private`
    : (np ? `${fmtBtc(np)} BTC could be made private - press ▶` : "everything is private ◆");
  $("mbToggle").textContent = S.cjOn ? "⏸" : "▶";
}

const esc = (s) => s.replace(/[&<>"']/g, (m) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

// ---------- dialogs -------------------------------------------------------------------
let dialogLocked = false;              // locked = Escape/overlay-click can't dismiss it
function openDialog(html, opts = {}) {
  $("dialog").innerHTML = html;
  $("overlay").classList.remove("hidden");
  dialogLocked = !!opts.locked;
}
function closeDialog(force = false) {
  if (dialogLocked && !force) return;  // e.g. the one-time mnemonic reveal
  dialogLocked = false;
  $("overlay").classList.add("hidden");
}
const dialogOpen = () => !$("overlay").classList.contains("hidden");
$("overlay").addEventListener("click", (e) => { if (e.target.id === "overlay") closeDialog(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDialog(); });

// sidebar wallet list: every wallet on the daemon, locked until the user opens it
function renderSidebar() {
  const el = $("sbWallets");
  el.innerHTML = S.wallets.map((w) => {
    const active = w === S.wallet;
    const open = active || (w in S.unlocked);
    return `<div class="swrow ${active ? "active" : ""}" data-w="${esc(w)}"
      title="${open ? esc(w) : esc(w) + " · locked - click to open"}">
      <span class="dot ${open ? "on" : ""}">●</span>
      <span class="swname">${esc(w)}</span>${open ? "" : '<span class="swlock">locked</span>'}</div>`;
  }).join("") + (S.walletsKnown
    ? `<div class="swrow add" id="sbAdd"><span class="dot">＋</span>
       <span class="swname">Add wallet</span></div>` : "");
  el.querySelectorAll(".swrow[data-w]").forEach((r) => {
    r.onclick = () => {
      const w = r.dataset.w;
      if (w === S.wallet) return;
      if (w in S.unlocked) activateWallet(w, S.unlocked[w]);
      else showUnlock(w);
    };
  });
  if ($("sbAdd")) $("sbAdd").onclick = showAddWallet;
}

async function activateWallet(name, pw) {
  try { await rpc("loadwallet", [name]); } catch (e) {}
  S.unlocked[name] = pw || "";        // held in memory for this session only
  S.wallet = name; localStorage.setItem("sabi9.wallet", name);
  S.info = null; S.coins = []; S.history = []; S.loading = true;
  closeDialog(); toast(`opening ${name} ...`); poll();
}

function showUnlock(name) {
  openDialog(`
    <h2><span class="back" onclick="closeDialog()">←</span> Open ${esc(name)}</h2>
    <div class="frow"><label>WALLET PASSWORD</label>
      <input id="ulPw" type="password" autofocus></div>
    <p class="setp">The password stays on this device for the session and pre-fills
      spend and coinjoin actions. The daemon verifies it when you spend - a wallet with
      no password opens with an empty field.</p>
    <div class="drow"><button class="abtn" onclick="closeDialog()">Cancel</button>
      <button class="abtn primary" id="ulGo">Open →</button></div>`);
  const go = () => activateWallet(name, $("ulPw").value);
  $("ulGo").onclick = go;
  $("ulPw").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  $("ulPw").focus();
}

function showAddWallet() {
  openDialog(`<h2>Add wallet</h2>
    <div class="wrow action" id="wpCreate"><span class="dot">＋</span> Create new wallet
      <span class="tag">generate →</span></div>
    <div class="wrow action" id="wpRecover"><span class="dot">⟳</span> Recover from backup
      <span class="tag">12–24 words →</span></div>
    <div class="wrow action" id="wpImport"><span class="dot">◇</span> Import hardware wallet
      <span class="tag">ColdCard · SeedSigner · watch-only →</span></div>`);
  $("wpCreate").onclick = showCreateWallet;
  $("wpRecover").onclick = showRecoverWallet;
  $("wpImport").onclick = showImportWallet;
}

// import a ColdCard / SeedSigner skeleton -> watch-only wallet (fully offline pairing)
function showImportWallet() {
  openDialog(`
    <h2><span class="back" id="iwBack">←</span> Import hardware wallet</h2>
    <p class="setp">Pairs a cold wallet <b>without it ever touching a computer network</b>:
      on a ColdCard run <i>Advanced → Export Wallet → Wasabi Wallet</i> and bring the file
      here by SD card - or paste the JSON / the account <b>xpub/zpub</b> shown by a
      SeedSigner. The result is a <b>watch-only</b> wallet: it sees balances and makes
      receive addresses, but this server can never spend from it.</p>
    <div class="frow"><label>WALLET NAME</label>
      <input id="iwName" placeholder="e.g. ColdCard" spellcheck="false"></div>
    <div id="iwDrop">⇩ drop the skeleton file here — or click to choose
      <input type="file" id="iwFile" accept=".json,application/json,text/plain" hidden></div>
    <div class="frow"><label>… OR PASTE - SKELETON JSON, OR A BARE XPUB / ZPUB</label>
      <textarea id="iwText" rows="4" spellcheck="false"
        placeholder='{"MasterFingerprint": "0F056943", "ExtPubKey": "xpub6..."}  ·  or  ·  zpub6r...'></textarea></div>
    <div class="frow"><label>MASTER FINGERPRINT (8 hex chars - auto-filled from the file)</label>
      <input id="iwFp" placeholder="0f056943" spellcheck="false" style="max-width:200px"></div>
    <div class="drow"><button class="abtn" id="iwCancel">Cancel</button>
      <button class="abtn primary" id="iwGo">Import →</button></div>`);
  $("iwBack").onclick = showAddWallet;
  $("iwCancel").onclick = () => closeDialog();

  const ingest = (text) => {
    $("iwText").value = text.trim();
    try {                                   // best-effort prefill; server re-validates
      const j = JSON.parse(text);
      const fp = j.MasterFingerprint || j.xfp || "";
      if (fp) $("iwFp").value = String(fp).toLowerCase();
      if (!$("iwName").value && j.ColdCardFirmwareVersion) $("iwName").value = "ColdCard";
    } catch (e) {}
  };
  const drop = $("iwDrop");
  drop.onclick = () => $("iwFile").click();
  $("iwFile").onchange = () => {
    const f = $("iwFile").files[0];
    if (f) f.text().then(ingest);
  };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => {
    e.preventDefault(); drop.classList.remove("over");
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) f.text().then(ingest);
  };

  $("iwGo").onclick = async () => {
    const name = $("iwName").value.trim();
    if (!name) return toast("wallet needs a name", true);
    if (!$("iwText").value.trim()) return toast("drop the skeleton file or paste it", true);
    try {
      $("iwGo").disabled = true;
      const r = await api("/import-skeleton", {
        name, skeleton: $("iwText").value, masterFingerprint: $("iwFp").value.trim(),
      });
      // the daemon only scans Wallets/ at startup - probe before activating
      try {
        await rpc("loadwallet", [r.name]);
        await activateWallet(r.name, "");   // watch-only: empty password
        toast(`◇ '${r.name}' imported - watch-only, syncing …`);
      } catch (e) {
        if (/not found/i.test(String(e.message || e))) showImportRestart(r.name);
        else throw e;
      }
    } catch (e) { toast("✗ " + friendly(e), true, 7000); $("iwGo").disabled = false; }
  };
}

// wallet file written, but the running daemon doesn't know it yet
function showImportRestart(name) {
  openDialog(`
    <h2>◇ '${esc(name)}' imported</h2>
    <div class="wchip good"><span class="wi">✓</span><span>The wallet file is on the server.
      The Wasabi daemon only scans its wallet folder <b>at startup</b>, so it needs one
      restart to see '${esc(name)}'.</span></div>
    <p class="setp">Restart now (the coinjoin/music box pauses for a minute while the daemon
      reboots and re-syncs), or later via StartOS → Sabi9 → Restart. Afterwards
      '${esc(name)}' appears in the sidebar.</p>
    <div class="drow"><button class="abtn" onclick="closeDialog()">Later</button>
      <button class="abtn primary" id="irGo">Restart the daemon now</button></div>`);
  $("irGo").onclick = async () => {
    try {
      $("irGo").disabled = true;
      await api("/restart-daemon");
      closeDialog();
      toast("daemon restarting - '" + name + "' will be in the sidebar in a minute ⟳", false, 8000);
    } catch (e) { toast("✗ " + friendly(e), true, 7000); $("irGo").disabled = false; }
  };
}

// create wallet: name + password -> daemon returns the recovery mnemonic (shown once)
function showCreateWallet() {
  openDialog(`
    <h2><span class="back" id="cwBack">←</span> Create wallet</h2>
    <div class="frow"><label>WALLET NAME</label>
      <input id="cwName" placeholder="e.g. Savings" spellcheck="false"></div>
    <div class="frow"><label>PASSWORD</label><input id="cwPw" type="password"></div>
    <div class="frow"><label>CONFIRM PASSWORD</label><input id="cwPw2" type="password"></div>
    <p style="color:var(--dim);font-size:12.5px">The password encrypts the wallet, is asked for
      every spend and coinjoin, and is <b>part of the recovery</b>: restoring this wallet later
      needs the recovery words <b>and</b> this exact password. It cannot be reset — write it down.</p>
    <div class="drow"><button class="abtn" id="cwCancel">Cancel</button>
      <button class="abtn primary" id="cwGo">Create →</button></div>`);
  $("cwBack").onclick = () => closeDialog();
  $("cwCancel").onclick = () => closeDialog();
  $("cwGo").onclick = async () => {
    const name = $("cwName").value.trim();
    const pw = $("cwPw").value, pw2 = $("cwPw2").value;
    if (!name) return toast("wallet needs a name", true);
    if (pw !== pw2) return toast("passwords don't match", true);
    try {
      $("cwGo").disabled = true;
      const mn = await rpc("createwallet", [name, pw]);
      const words = typeof mn === "string" ? mn : (mn && (mn.mnemonic || mn.recoveryWords)) || String(mn);
      showMnemonic(name, words, pw);
    } catch (e) { toast("✗ " + friendly(e), true, 6000); $("cwGo").disabled = false; }
  };
}

// one-time recovery-words reveal; must acknowledge before the wallet opens
function showMnemonic(name, mnemonic, pw) {
  const words = String(mnemonic).split(/\s+/).filter(Boolean);
  const grid = words.map((w, i) =>
    `<div class="mnw"><span class="mni">${i + 1}</span>${esc(w)}</div>`).join("");
  openDialog(`
    <h2>Recovery words · ${esc(name)}</h2>
    <div class="wchip warn"><span class="wi">⚠</span><span>Write these ${words.length} words on paper,
      <b>in this order</b>. They are shown <b>only once</b>. Anyone who has them can take your coins —
      never type them into anything but a wallet you trust.</span></div>
    <div class="wchip info"><span class="wi">ⓘ</span><span>Restoring this wallet needs the words
      <b>and your password together</b> — a different password recovers a different (empty) wallet.
      Store the words and the password in <b>separate places</b>.</span></div>
    <div id="mnGrid">${grid}</div>
    <label class="mnack"><input type="checkbox" id="mnAck"> I have written them down safely</label>
    <div class="drow"><button class="abtn primary" id="mnDone" disabled>Open wallet →</button></div>`,
    { locked: true });                 // Escape / overlay-click must not eat the only reveal
  $("mnAck").onchange = () => { $("mnDone").disabled = !$("mnAck").checked; };
  $("mnDone").onclick = async () => {
    closeDialog(true);                 // release the lock, then open normally
    await activateWallet(name, pw);
    toast(`wallet '${name}' created ✓`);
  };
}

// recover wallet from a 12/15/18/21/24-word mnemonic + new password
function showRecoverWallet() {
  openDialog(`
    <h2><span class="back" id="rwBack">←</span> Recover wallet</h2>
    <div class="frow"><label>WALLET NAME</label>
      <input id="rwName" placeholder="e.g. Savings" spellcheck="false"></div>
    <div class="frow"><label>RECOVERY WORDS (12 · 15 · 18 · 21 · 24, space separated)</label>
      <textarea id="rwMn" rows="3" placeholder="word1 word2 word3 …" spellcheck="false"></textarea></div>
    <div class="frow"><label>WALLET PASSWORD — THE ONE USED WHEN THE WALLET WAS CREATED</label>
      <input id="rwPw" type="password"></div>
    <p style="color:var(--dim);font-size:12.5px">The password is part of the wallet itself: words +
      a <b>different</b> password open a different (empty) wallet, with no error shown. If the
      balance comes up empty, re-check the password first. Recovery re-scans block filters —
      balances may take a while to appear.</p>
    <div class="drow"><button class="abtn" id="rwCancel">Cancel</button>
      <button class="abtn primary" id="rwGo">Recover →</button></div>`);
  $("rwBack").onclick = () => closeDialog();
  $("rwCancel").onclick = () => closeDialog();
  $("rwGo").onclick = async () => {
    const name = $("rwName").value.trim();
    const mn = $("rwMn").value.trim().split(/\s+/).filter(Boolean).join(" ");
    const pw = $("rwPw").value;
    const wc = mn ? mn.split(" ").length : 0;
    if (!name) return toast("wallet needs a name", true);
    if (![12, 15, 18, 21, 24].includes(wc))
      return toast("recovery must be 12 / 15 / 18 / 21 / 24 words", true);
    try {
      $("rwGo").disabled = true;
      await rpc("recoverwallet", [name, mn, pw]);
      await activateWallet(name, pw);
      toast(`wallet '${name}' recovered — syncing …`);
    } catch (e) { toast("✗ " + friendly(e), true, 6000); $("rwGo").disabled = false; }
  };
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
            <input id="pvPw" type="password" value="${esc(pwOf())}"></div>
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
      } catch (e) { toast("✗ " + friendly(e), true, 6000); $("pvConfirm").disabled = false; }
    };
  };
  draw();
}

// ---------- receive --------------------------------------------------------------------
function showReceive() {
  openDialog(`
    <h2><span class="back" onclick="closeDialog()">←</span> Receive</h2>
    <div class="frow"><label>LABEL — WHO KNOWS THIS ADDRESS IS YOURS? (required)</label>
      <input id="rvLbl" placeholder="e.g. alice (repaying you for pizza)"></div>
    <p class="setp">Name the observers: everyone who will know this address belongs to you.
      Wasabi uses these labels to warn you before a spend links people together.</p>
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
    } catch (e) { toast("✗ " + friendly(e), true); }
  };
}

// ---------- coinjoin --------------------------------------------------------------------
async function showCoinjoin() {
  const np = S.coins.filter((c) => anonOf(c) < target()).reduce((a, c) => a + (c.amount || 0), 0);
  let pays = [];
  try { pays = (await rpc("listpaymentsincoinjoin", [], S.wallet)) || []; } catch (e) {}
  const others = S.wallets.filter((w) => w !== S.wallet);
  const payRows = pays.map((p) => {
    const stArr = p.state || [];
    const stat = (stArr[stArr.length - 1] || {}).status || "?";
    return `<div class="payrow"><span>${fmtBtc(p.amount || 0)} BTC</span>
      <span class="setp" style="margin:0">→ ${esc(String(p.destination || "").slice(0, 24))}… · ${esc(String(stat))}</span>
      <span class="px" data-id="${esc(String(p.id))}" title="cancel this payment">✕</span></div>`;
  }).join("") || `<p class="setp">none yet - a payment placed here is paid out of a coinjoin
     round, so on-chain it never looks like a normal wallet spend.</p>`;

  openDialog(`
    <h2><span class="back" onclick="closeDialog()">←</span> Coinjoin</h2>
    ${S.noCoord ? `<div class="wchip warn"><span class="wi">⚠</span><span>No coordinator configured -
      coinjoin is disabled. <a id="cjFix" style="cursor:pointer;text-decoration:underline">Choose
      one in Settings</a>.</span></div>` : ""}
    <div class="fact"><span class="fi">◆</span><span class="fk">Status</span>
      <span class="fv">${esc(String((S.info && S.info.coinjoinStatus) || "Idle"))}</span></div>
    <div class="fact"><span class="fi">₿</span><span class="fk">Still non-private</span>
      <span class="fv">${fmtBtc(np)} BTC</span></div>
    <div class="frow" style="margin-top:16px"><label>WALLET PASSWORD</label>
      <input id="cjPw" type="password" value="${esc(pwOf())}"></div>
    <div class="radio">
      <label><input type="radio" name="cjMode" value="auto" checked>
        mix until everything reaches target ${target()}, then stop</label>
      <label><input type="radio" name="cjMode" value="cont"> keep mixing (continuous)</label>
    </div>
    <div class="drow">
      <button class="abtn" id="cjStop">Stop</button>
      <button class="abtn primary" id="cjStart">Start coinjoin</button>
    </div>
    <div class="improve">SWEEP VIA COINJOIN</div>
    ${others.length ? `
      <div class="inline2"><div class="frow"><label>SWEEP EVERYTHING INTO</label>
        <select id="cjOutW">${others.map((w) => `<option>${esc(w)}</option>`).join("")}</select></div>
        <div class="frow" style="flex:0 0 auto;align-self:flex-end">
          <button class="abtn" id="cjSweep">Sweep →</button></div></div>
      <p class="setp">Coinjoins this wallet's coins and pays the outputs straight into the other
        wallet - nothing on-chain links the two.</p>`
      : `<p class="setp">needs a second wallet to sweep into - create one from the wallet picker.</p>`}
    <div class="improve">PAYMENTS INSIDE COINJOIN</div>
    ${payRows}
    <div class="inline2">
      <div class="frow"><label>ADDRESS</label><input id="cjPayAddr" placeholder="bc1q…" spellcheck="false"></div>
      <div class="frow" style="flex:0 0 130px"><label>AMOUNT (BTC)</label><input id="cjPayAmt" placeholder="0.001"></div>
      <div class="frow" style="flex:0 0 auto;align-self:flex-end">
        <button class="abtn" id="cjPayGo">Add</button></div>
    </div>`);

  if ($("cjFix")) $("cjFix").onclick = showSettings;
  $("cjStart").onclick = async () => {
    const auto = document.querySelector('input[name="cjMode"]:checked').value === "auto";
    try { await rpc("startcoinjoin", [$("cjPw").value, auto, true], S.wallet);
          closeDialog(); toast("coinjoin started ◆"); poll(); }
    catch (e) { toast("✗ " + friendly(e), true, 6000); }
  };
  $("cjStop").onclick = async () => {
    try { await rpc("stopcoinjoin", [], S.wallet); closeDialog(); toast("coinjoin stopped"); poll(); }
    catch (e) { toast("✗ " + friendly(e), true); }
  };
  if ($("cjSweep")) $("cjSweep").onclick = async () => {
    const outw = $("cjOutW").value;
    try { await rpc("startcoinjoinsweep", [$("cjPw").value, outw], S.wallet);
          closeDialog(); toast(`sweep started - coins will land in ${outw} ◆`); poll(); }
    catch (e) { toast("✗ " + friendly(e), true, 6000); }
  };
  $("cjPayGo").onclick = async () => {
    const addr = $("cjPayAddr").value.trim();
    const amt = Math.round(parseFloat($("cjPayAmt").value) * 1e8);
    if (!/^(bc1|tb1|bcrt1|[13mn2])[0-9a-zA-Z]{20,90}$/.test(addr))
      return toast("that doesn't look like a bitcoin address", true);
    if (!amt || amt <= 0) return toast("enter a positive amount", true);
    try { await rpc("payincoinjoin", [addr, amt], S.wallet); toast("payment queued ◆"); showCoinjoin(); }
    catch (e) { toast("✗ " + friendly(e), true, 6000); }
  };
  document.querySelectorAll(".payrow .px").forEach((x) => {
    x.onclick = async () => {
      try { await rpc("cancelpaymentincoinjoin", [x.dataset.id], S.wallet);
            toast("payment cancelled"); showCoinjoin(); }
      catch (e) { toast("✗ " + friendly(e), true); }
    };
  });
}

// ---------- pending-tx rescue (RBF/CPFP speed up · cancel) -------------------------------
function showTxFix(kind, tid) {
  const speed = kind === "speed";
  openDialog(`
    <h2><span class="back" onclick="closeDialog()">←</span> ${speed ? "Speed up" : "Cancel"} transaction</h2>
    <div class="fact"><span class="fi">⇄</span><span class="fk">Transaction</span>
      <span class="fv">${esc(String(tid))}</span></div>
    <div class="frow" style="margin-top:14px"><label>WALLET PASSWORD</label>
      <input id="tfPw" type="password" value="${esc(pwOf())}"></div>
    <p class="setp">${speed ? "builds + broadcasts a higher-fee replacement (RBF, or CPFP for incoming)"
                            : "spends the funds back to yourself with a higher fee before it confirms"}</p>
    <div class="drow"><button class="abtn" onclick="closeDialog()">Close</button>
      <button class="abtn primary" id="tfGo">Confirm</button></div>`);
  $("tfGo").onclick = async () => {
    try {
      $("tfGo").disabled = true;
      const hx = await rpc(speed ? "speeduptransaction" : "canceltransaction",
                           [tid, $("tfPw").value], S.wallet);
      const r = await rpc("broadcast", [typeof hx === "string" ? hx : String(hx)]);
      const nt = (r && r.txid) || String(r);
      closeDialog();
      toast((speed ? "fee bumped ✓ " : "cancelled ✓ ") + String(nt).slice(0, 16) + "…");
      poll();
    } catch (e) { toast("✗ " + friendly(e), true, 6000); $("tfGo").disabled = false; }
  };
}

// ---------- settings (coordinator + Bitcoin Core RPC backend) ----------------------------
function coordHost(url) {
  let h;
  try { h = new URL(url).host.toLowerCase(); } catch (e) { h = String(url); }
  for (const p of ["www.", "api.", "btcpay.", "coordinator.", "coinjoin.", "wabisabi."])
    if (h.startsWith(p) && h.slice(p.length).includes(".")) h = h.slice(p.length);
  return h || String(url);
}

async function showSettings(tab = "coordinator") {
  let s;
  try { s = await api("/settings"); } catch (e) { return toast("✗ " + friendly(e), true); }
  // enum-ish fields: offer only values Wasabi 2.8 ships (plus whatever is set now) -
  // its strict config loader re-defaults the whole file on an undecodable value
  const sel = (id, cur, opts) => `<select id="${id}">` +
    [...new Set([cur, ...opts])].filter(Boolean).map((o) =>
      `<option${o === cur ? " selected" : ""}>${esc(String(o))}</option>`).join("") + `</select>`;

  openDialog(`
    <h2><span class="back" onclick="closeDialog()">←</span> Settings
      <span class="setp" style="margin:0 0 0 auto">network: <b>${esc(String(s.network))}</b></span></h2>
    <div class="stabs">
      <button class="stab" data-t="bitcoin">Bitcoin</button>
      <button class="stab" data-t="coordinator">Coordinator</button>
      <button class="stab" data-t="privacy">Privacy</button>
    </div>

    <div id="st-bitcoin" class="stsec hidden">
      <div class="improve">BITCOIN CORE RPC BACKEND · OPTIONAL</div>
      <p class="setp">If Bitcoin Core runs on this Start9 node, the daemon fetches blocks and
        filters from it instead of syncing from public P2P peers. Empty = keep P2P.</p>
      <div class="detline"><button class="abtn" id="stDetect">Detect bitcoind</button>
        <span id="stDetRes" class="setp" style="margin:0"></span></div>
      <div class="inline2">
        <div class="frow"><label>ENDPOINT (host:port)</label>
          <input id="stRpcEp" value="${esc(s.bitcoinRpcEndPoint || "")}"
                 placeholder="bitcoind.embassy:8332" spellcheck="false"></div>
        <div class="frow"><label>CREDENTIALS (user:password)${s.bitcoinRpcCredentialSet ? " · currently set" : ""}</label>
          <input id="stRpcCred" type="password"
                 placeholder="${s.bitcoinRpcCredentialSet ? "unchanged" : "rpcuser:rpcpassword"}"></div>
      </div>
      <div class="improve">MEMPOOL</div>
      <div class="inline2">
        <div class="frow"><label>DUST THRESHOLD (BTC) - ignore smaller incoming coins</label>
          <input id="stDust" value="${esc(String(s.dustThreshold))}" spellcheck="false"></div>
        <div class="frow"><label>MAX DAYS IN MEMPOOL - rebroadcast/forget after</label>
          <input id="stMemDays" value="${esc(String(s.maxDaysInMempool))}" spellcheck="false"></div>
      </div>
    </div>

    <div id="st-coordinator" class="stsec hidden">
      <p class="setp">Wasabi ships without a coordinator - you choose who batches your rounds.
        A coordinator sees coinjoin activity and sets the coordination fee; it can <b>never</b>
        steal funds. Current:
        <b>${s.coordinatorUri ? esc(coordHost(s.coordinatorUri)) : "none - coinjoin is disabled"}</b></p>
      <div id="coordList"><p class="setp">… fetching live coordinators (liquisabi.com) …</p></div>
      <div class="frow"><label>COORDINATOR URL · empty = run without one · .onion ok via the daemon's Tor</label>
        <input id="stCoord" value="${esc(s.coordinatorUri || "")}" spellcheck="false"
               placeholder="https://your.coordinator/"></div>
      <div class="inline2">
        <div class="frow"><label>MAX COINJOIN MINING FEE RATE (sat/vB) - skip pricier rounds</label>
          <input id="stMaxFee" value="${esc(String(s.maxCoinJoinMiningFeeRate))}" spellcheck="false"></div>
        <div class="frow"><label>MIN INPUT COUNT - refuse smaller rounds (default 21)</label>
          <input id="stMinIn" value="${esc(String(s.absoluteMinInputCount))}" spellcheck="false"></div>
      </div>
      <div class="frow"><label>COORDINATOR IDENTIFIER · advanced - leave as-is unless yours says otherwise</label>
        <input id="stCoordId" value="${esc(String(s.coordinatorIdentifier))}" spellcheck="false"></div>
    </div>

    <div id="st-privacy" class="stsec hidden">
      <div class="improve">NETWORK PRIVACY</div>
      <div class="frow"><label>TOR - all daemon HTTP goes through Tor when enabled</label>
        ${sel("stTor", s.useTor, ["Enabled", "Disabled"])}</div>
      <div class="improve">EXTERNAL SERVICES - each query leaves your node (via Tor when enabled)</div>
      <div class="inline2">
        <div class="frow"><label>EXCHANGE RATE</label>
          ${sel("stXr", s.exchangeRateProvider, ["MempoolSpace", "BlockstreamInfo"])}</div>
        <div class="frow"><label>FEE ESTIMATION</label>
          ${sel("stFr", s.feeRateEstimationProvider, ["MempoolSpace", "BlockstreamInfo"])}</div>
        <div class="frow"><label>TX BROADCAST FALLBACK</label>
          ${sel("stBc", s.externalTransactionBroadcaster, ["MempoolSpace", "BlockstreamInfo"])}</div>
      </div>
      <div class="improve">WALLET (read-only)</div>
      <p class="setp">Anonymity score target of the open wallet:
        <b>${esc(String((S.info && S.info.anonScoreTarget) || "—"))}</b> · these live per-wallet
        in the wallet file; the daemon has no RPC to change them yet.</p>
    </div>

    <div id="stSaved"></div>
    <div class="drow"><button class="abtn" onclick="closeDialog()">Close</button>
      <button class="abtn primary" id="stSave">Save</button></div>`);

  const switchTab = (t) => {
    document.querySelectorAll(".stsec").forEach((el) =>
      el.classList.toggle("hidden", el.id !== "st-" + t));
    document.querySelectorAll(".stab").forEach((b) =>
      b.classList.toggle("active", b.dataset.t === t));
  };
  document.querySelectorAll(".stab").forEach((b) => b.onclick = () => switchTab(b.dataset.t));
  switchTab(tab);

  api("/coordinators").then((c) => {
    if (!$("coordList")) return;                     // dialog was closed meanwhile
    const rows = [], seen = new Set();
    for (const [name, url, desc] of c.known || []) { seen.add(url); rows.push({ name, url, desc }); }
    for (const [url, cnt] of c.live || [])
      if (!seen.has(url)) rows.push({ name: coordHost(url), url, desc: `${cnt} public rounds / 14 days` });
    $("coordList").innerHTML = rows.map((r) =>
      `<div class="wrow crow" data-url="${esc(r.url)}"><span class="dot on">●</span> ${esc(r.name)}
        <span class="setp">${esc(r.desc)}</span><span class="tag">use →</span></div>`).join("");
    document.querySelectorAll(".crow").forEach((r) => {
      r.onclick = () => { $("stCoord").value = r.dataset.url; };
    });
  }).catch(() => { if ($("coordList")) $("coordList").innerHTML = ""; });

  $("stDetect").onclick = async () => {
    $("stDetRes").textContent = "probing …";
    try {
      const d = await api("/detect-bitcoind");
      if (d.found && d.found.length) {
        $("stDetRes").textContent = "found " + d.found.join(", ") + " ✓";
        $("stRpcEp").value = d.found[0];
      } else $("stDetRes").textContent = "no bitcoind reachable - P2P syncing stays on";
    } catch (e) { $("stDetRes").textContent = "probe failed: " + e.message; }
  };

  $("stSave").onclick = async () => {
    const body = {
      coordinatorUri: $("stCoord").value.trim(),
      coordinatorIdentifier: $("stCoordId").value.trim(),
      maxCoinJoinMiningFeeRate: $("stMaxFee").value.trim(),
      absoluteMinInputCount: $("stMinIn").value.trim(),
      bitcoinRpcEndPoint: $("stRpcEp").value.trim(),
      dustThreshold: $("stDust").value.trim(),
      maxDaysInMempool: $("stMemDays").value.trim(),
      useTor: $("stTor").value,
      exchangeRateProvider: $("stXr").value,
      feeRateEstimationProvider: $("stFr").value,
      externalTransactionBroadcaster: $("stBc").value,
    };
    const cred = $("stRpcCred").value;
    if (cred) body.bitcoinRpcCredentialString = cred;
    try {
      $("stSave").disabled = true;
      await api("/settings", body);
      $("stSaved").innerHTML = `<div class="wchip good"><span class="wi">✓</span>
        <span>Saved to Config.json. <b>Restart the Sabi9 service</b> (StartOS → Sabi9 → Restart) -
        the daemon only reads its config at startup.</span></div>`;
      $("stSave").disabled = false;
    } catch (e) { toast("✗ " + friendly(e), true, 6000); $("stSave").disabled = false; }
  };
}

// ---------- wire up -----------------------------------------------------------------------
$("btnSend").onclick = showSend;
$("btnReceive").onclick = showReceive;
// wallet-file backup: the only backup that keeps labels + anonymity metadata.
// (Uninstalling the service DELETES the data volume - see instructions.)
$("btnExport").onclick = () => {
  if (!S.wallet) return;
  const a = document.createElement("a");
  if (DEMO) {
    const blob = new Blob(
      [JSON.stringify({ demo: true, walletName: S.wallet, HdPubKeys: [] }, null, 2)],
      { type: "application/json" });
    a.href = URL.createObjectURL(blob);
  } else {
    a.href = "/export-wallet?name=" + encodeURIComponent(S.wallet);
  }
  a.download = S.wallet + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  if (DEMO) URL.revokeObjectURL(a.href);
  toast("⇓ wallet file downloading - it holds your labels and (encrypted) keys, store it like cash");
};
$("wCreate").onclick = showCreateWallet;
$("wRecover").onclick = showRecoverWallet;
$("navSettings").onclick = showSettings;
$("search").addEventListener("focus", () => { $("search").blur(); showSettings(); });
$("navRefresh").onclick = () => { toast("refreshing ..."); poll(); };
$("navDiscreet").onclick = () => {
  S.discreet = !S.discreet;
  localStorage.setItem("sabi9.discreet", S.discreet ? "1" : "0");
  toast(S.discreet ? "discreet mode on" : "discreet mode off");
  render();
};
// music box = the coinjoin control: ▶ starts auto-coinjoin with the session password,
// falls back to the full dialog when the daemon rejects it (wrong/missing password)
$("mbToggle").onclick = async () => {
  if (S.cjOn) {
    try { await rpc("stopcoinjoin", [], S.wallet); toast("coinjoin paused"); poll(); }
    catch (e) { toast("✗ " + friendly(e), true); }
    return;
  }
  try {
    await rpc("startcoinjoin", [pwOf(), true, true], S.wallet);
    toast("coinjoin started ◆  mixing until everything is private"); poll();
  } catch (e) { showCoinjoin(); toast("✗ " + friendly(e), true, 5000); }
};
$("mbStop").onclick = () => rpc("stopcoinjoin", [], S.wallet).then(() => { toast("coinjoin stopped"); poll(); });
$("mbMore").onclick = () => showCoinjoin();

// ---------- demo mode (preview without a daemon) -------------------------------------------
const DEMO_PAYS = [];                              // stateful: pay-in-coinjoin queue
// ?demo=1&empty=1 -> daemon with no wallets yet (exercises the welcome flow)
const DEMO_WALLETS = new URLSearchParams(location.search).has("empty")
  ? [] : ["Alice's Wallet", "ColdVault"];
const DEMO_SETTINGS = {
  coordinatorUri: "", coordinatorIdentifier: "CoinJoinCoordinatorIdentifier",
  maxCoinJoinMiningFeeRate: 50, absoluteMinInputCount: 21,
  bitcoinRpcEndPoint: "", bitcoinRpcCredentialSet: false, network: "Main",
  dustThreshold: "0.00001", maxDaysInMempool: 30, useTor: "Enabled",
  exchangeRateProvider: "MempoolSpace", feeRateEstimationProvider: "MempoolSpace",
  externalTransactionBroadcaster: "MempoolSpace", configFound: true,
};
const DEMO_WATCHONLY = new Set();

function demoRpc(method, params, wallet) {
  const W = DEMO_WALLETS;
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
  if (method === "createwallet") {
    DEMO_WALLETS.push(params[0]);
    return Promise.resolve(
      "ripple lunar velvet cabin oxygen jungle mimic dawn cluster ozone crisp anchor");
  }
  if (method === "recoverwallet") { DEMO_WALLETS.push(params[0]); return Promise.resolve(null); }
  if (method === "payincoinjoin") {
    const id = "pay-" + (DEMO_PAYS.length + 1);
    DEMO_PAYS.push({ id, amount: params[1], destination: "0014" + "ab".repeat(20),
                     state: [{ status: "Pending" }] });
    return Promise.resolve(id);
  }
  if (method === "listpaymentsincoinjoin") return Promise.resolve([...DEMO_PAYS]);
  if (method === "cancelpaymentincoinjoin") {
    const i = DEMO_PAYS.findIndex((p) => p.id === params[0]);
    if (i >= 0) DEMO_PAYS.splice(i, 1);
    return Promise.resolve(null);
  }
  const m = {
    getstatus: { exchangeRate: 66186, torStatus: "Running", peers: [1, 2, 3],
                 bestBlockchainHeight: "956652", filtersCount: 956652, filtersLeft: 0,
                 network: "Main" },
    listwallets: W.map((w) => ({ walletName: w })),
    getwalletinfo: { walletName: wallet, loaded: true, anonScoreTarget: 5, coinjoinStatus: "Idle",
                     isWatchOnly: DEMO_WATCHONLY.has(wallet),
                     balance: coins.reduce((a, c) => a + c.amount, 0) },
    listunspentcoins: coins, gethistory: hist,
    getfeerates: { 2: 12, 6: 7, 144: 1 },
    getnewaddress: { address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4" },
    loadwallet: null, startcoinjoin: null, stopcoinjoin: null, startcoinjoinsweep: null,
    send: { txid: "d".repeat(64) },
    broadcast: { txid: "e".repeat(64) },
    speeduptransaction: "02000000" + "ab".repeat(60),
    canceltransaction: "02000000" + "ab".repeat(60),
  };
  if (!(method in m)) throw new Error("demo: " + method);
  return Promise.resolve(m[method]);
}

function demoApi(path, body) {
  if (path === "/settings" && body !== undefined) {
    for (const k of Object.keys(DEMO_SETTINGS))
      if (k in body) DEMO_SETTINGS[k] = body[k];
    if (body.bitcoinRpcCredentialString) DEMO_SETTINGS.bitcoinRpcCredentialSet = true;
    return Promise.resolve({ ok: true, restartRequired: true });
  }
  if (path === "/settings") return Promise.resolve({ ...DEMO_SETTINGS });
  if (path === "/coordinators") return Promise.resolve({
    known: [["coinjoin.nl", "https://coinjoin.nl/", "this project's coordinator"],
            ["kruw.io", "https://coinjoin.kruw.io/", "well-known, long-running"]],
    live: [["https://coinjoin.kruw.io/", 1243], ["https://wasabist.example/", 87]],
  });
  if (path === "/detect-bitcoind") return Promise.resolve({ found: ["bitcoind.embassy:8332"] });
  if (path === "/restart-daemon") return Promise.resolve({ ok: true });
  if (path === "/import-skeleton") {
    if (!/xpub|zpub|ExtPubKey/.test(String(body.skeleton))) return Promise.reject(new Error("demo: no key found"));
    DEMO_WALLETS.push(body.name); DEMO_WATCHONLY.add(body.name);
    return Promise.resolve({ ok: true, name: body.name });
  }
  return Promise.reject(new Error("demo api: " + path));
}

// go
poll();
setInterval(poll, 5000);
