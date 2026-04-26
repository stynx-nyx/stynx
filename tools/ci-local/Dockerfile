FROM ubuntu:24.04

ARG NODE_MAJOR=24
ARG PNPM_VERSION=9.15.0

ENV CI=true \
    DEBIAN_FRONTEND=noninteractive \
    FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    g++ \
    git \
    gnupg \
    iproute2 \
    jq \
    lsb-release \
    make \
    netcat-openbsd \
    postgresql-client \
    procps \
    python3 \
    ripgrep \
    rsync \
    sudo \
    unzip \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

RUN install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc \
  && chmod a+r /etc/apt/keyrings/docker.asc \
  && . /etc/os-release \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    containerd.io \
    docker-buildx-plugin \
    docker-ce \
    docker-ce-cli \
    docker-compose-plugin \
  && rm -rf /var/lib/apt/lists/*

RUN if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
    curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
      | gpg --dearmor -o /etc/apt/keyrings/google-linux.gpg \
    && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-linux.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
      > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*; \
  else \
    echo "google-chrome-stable is only installed for linux/amd64; docs job will fall back to Playwright Chromium"; \
  fi

RUN npm install -g "pnpm@${PNPM_VERSION}" \
  && mkdir -p /pnpm/store \
  && pnpm config set store-dir /pnpm/store \
  && pnpm --version \
  && node --version \
  && git config --global --add safe.directory /workspace

COPY scripts/ci-local/inside.sh /usr/local/bin/stynx-ci-local
RUN chmod +x /usr/local/bin/stynx-ci-local

WORKDIR /workspace
ENTRYPOINT ["stynx-ci-local"]
