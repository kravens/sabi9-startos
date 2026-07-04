# Sabi9: Wasabi Wallet daemon 2.8.0 + web UI, one image, two daemons (see startos/main.ts)
FROM debian:bookworm-slim

ARG WASABI_VERSION=2.8.0
ARG TARGETARCH

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl python3 libicu72 && \
    rm -rf /var/lib/apt/lists/*

# Wasabi ships self-contained linux builds for both arches (x64 / arm64)
RUN ARCH=$([ "$TARGETARCH" = "arm64" ] && echo linux-arm64 || echo linux-x64) && \
    curl -fsSL -o /tmp/wasabi.tar.gz \
      "https://github.com/WalletWasabi/WalletWasabi/releases/download/v${WASABI_VERSION}/Wasabi-${WASABI_VERSION}-${ARCH}.tar.gz" && \
    mkdir -p /opt/wasabi && \
    tar -xzf /tmp/wasabi.tar.gz -C /opt/wasabi --strip-components=1 && \
    rm /tmp/wasabi.tar.gz && \
    chmod +x /opt/wasabi/wassabeed || true

COPY web/ /opt/sabi9/
COPY wasabi-start.sh /usr/local/bin/wasabi-start.sh
RUN chmod +x /usr/local/bin/wasabi-start.sh

ENV HOME=/data
WORKDIR /data
