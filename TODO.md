# TODO

- Run `npm install` in WSL to generate **package-lock.json**, then commit it
  (the CI workflows use `npm ci`, which requires the lock).
- First WSL build: confirm `make x86` produces `sabi9_x86_64.s9pk` and the Wasabi
  daemon starts inside the container (Tor bootstrap + P2P filter sync).
- Sideload-test on a Start9 OS VM: wallet load, receive+QR, send preview
  (change avoidance), coinjoin start/stop.
- Payments-inside-coinjoin + sweep-to-wallet dialogs (RPC already whitelisted).
- Automation-rules tab (port of sabi.py's auto tab).
- Optional bitcoind dependency for block download via a local node.
- Optional basic-auth on the web interface.
