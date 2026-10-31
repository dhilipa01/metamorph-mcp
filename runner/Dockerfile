# Metamorph verification runner image. It executes UNTRUSTED project code (composer/npm installs without
# scripts, project tests, scanners). Run it only in a container or a GitHub Actions ephemeral VM, never in the MCP server.
# Build:  docker build -t metamorph-runner -f runner/Dockerfile runner
# Every download is pinned to a version and verified against a published or recorded sha256.
FROM php:8.4-cli-bookworm

ARG TARGETARCH
ARG NODE_VERSION=22.23.4
ARG COMPOSER_VERSION=2.11.1
ARG COMPOSER_SHA256=6f1b891e1d4927d62740276c540fb490e47689e19e102c49e8da849794882f8c
ARG TRIVY_VERSION=0.76.1
ARG GITLEAKS_VERSION=8.30.1
ARG HADOLINT_VERSION=2.15.1
ARG SEMGREP_VERSION=1.183.0
ARG CHECKOV_VERSION=3.4.0
ARG PHPSTAN_VERSION=2.3.4
ARG RECTOR_VERSION=2.8.3

ENV DEBIAN_FRONTEND=noninteractive \
    COMPOSER_HOME=/opt/composer-home \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Base packages, PHP extensions that most projects need, python for the pip tools
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git unzip xz-utils \
      python3 python3-venv libzip-dev libicu-dev \
 && docker-php-ext-install -j"$(nproc)" zip intl bcmath pdo_mysql pcntl exif \
 && apt-mark manual libzip4 libicu72 \
 && apt-get purge -y --auto-remove libzip-dev libicu-dev \
 && rm -rf /var/lib/apt/lists/*

# Node 22 (official tarball, sha256 from nodejs.org SHASUMS256.txt)
RUN case "${TARGETARCH:-amd64}" in \
      amd64) NA=x64;   NSUM=1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce ;; \
      arm64) NA=arm64; NSUM=6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b ;; \
      *) echo "unsupported arch" >&2; exit 1 ;; esac \
 && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NA}.tar.xz" -o /tmp/node.tar.xz \
 && echo "${NSUM}  /tmp/node.tar.xz" | sha256sum -c - \
 && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --no-same-owner \
 && rm /tmp/node.tar.xz

# Composer (sha256 from getcomposer.org/download/<version>/composer.phar.sha256sum)
RUN curl -fsSL "https://getcomposer.org/download/${COMPOSER_VERSION}/composer.phar" -o /usr/local/bin/composer \
 && echo "${COMPOSER_SHA256}  /usr/local/bin/composer" | sha256sum -c - \
 && chmod +x /usr/local/bin/composer

# Trivy, gitleaks, hadolint: GitHub release binaries, sha256 from each project's published checksum file
RUN case "${TARGETARCH:-amd64}" in \
      amd64) TA=64bit; TSUM=c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0; \
             GA=x64;   GSUM=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb; \
             HA=x86_64; HSUM=c7187db94eeeeca956519a6af171adc31453941a1e777961f6e680f697c8c507 ;; \
      arm64) TA=ARM64; TSUM=e174dff2a6dba5e3ae41f8d0537a6324405bd08132497340304c6b20e0f16a1f; \
             GA=arm64; GSUM=e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080; \
             HA=arm64;  HSUM=f6198ef8090f404dbb771abfee086eb8c48ac177f30da7fd3510aca35b344b5d ;; \
      *) echo "unsupported arch" >&2; exit 1 ;; esac \
 && mkdir /tmp/dl && cd /tmp/dl \
 && curl -fsSL "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-${TA}.tar.gz" -o trivy.tgz \
 && echo "${TSUM}  trivy.tgz" | sha256sum -c - && tar -xzf trivy.tgz trivy && install -m 0755 trivy /usr/local/bin/trivy \
 && curl -fsSL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${GA}.tar.gz" -o gl.tgz \
 && echo "${GSUM}  gl.tgz" | sha256sum -c - && tar -xzf gl.tgz gitleaks && install -m 0755 gitleaks /usr/local/bin/gitleaks \
 && curl -fsSL "https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}/hadolint-linux-${HA}" -o hadolint \
 && echo "${HSUM}  hadolint" | sha256sum -c - && install -m 0755 hadolint /usr/local/bin/hadolint \
 && cd / && rm -rf /tmp/dl

# semgrep and checkov in separate virtualenvs (their dependency trees conflict). PyPI gives no per-release
# checksum we can pin ahead of time, so the exact version pin is the integrity control here.
RUN python3 -m venv /opt/venv-semgrep && /opt/venv-semgrep/bin/pip install "semgrep==${SEMGREP_VERSION}" \
 && python3 -m venv /opt/venv-checkov && /opt/venv-checkov/bin/pip install "checkov==${CHECKOV_VERSION}" \
 && ln -s /opt/venv-semgrep/bin/semgrep /usr/local/bin/semgrep \
 && ln -s /opt/venv-checkov/bin/checkov /usr/local/bin/checkov

# phpstan and rector via composer, pinned. Each gets its own project dir: rector bundles its own phpstan and a
# shared `composer global` tree makes the two constrain each other.
RUN mkdir -p /opt/phpstan /opt/rector \
 && COMPOSER_ALLOW_SUPERUSER=1 composer require --working-dir=/opt/phpstan --no-interaction --no-progress --no-scripts "phpstan/phpstan:${PHPSTAN_VERSION}" \
 && COMPOSER_ALLOW_SUPERUSER=1 composer require --working-dir=/opt/rector --no-interaction --no-progress --no-scripts "rector/rector:${RECTOR_VERSION}" \
 && ln -s /opt/phpstan/vendor/bin/phpstan /usr/local/bin/phpstan \
 && ln -s /opt/rector/vendor/bin/rector /usr/local/bin/rector \
 && rm -rf /opt/composer-home

COPY rules /opt/metamorph/rules
COPY rector.php /opt/metamorph/rector.php
COPY metamorph-run.mjs /opt/metamorph/metamorph-run.mjs

# Non-root user. /work holds the clone, /out receives result.json.
RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin runner \
 && mkdir -p /work /out && chown runner:runner /work /out
USER runner
ENV HOME=/home/runner COMPOSER_HOME=/home/runner/.composer
WORKDIR /work
ENTRYPOINT ["node", "/opt/metamorph/metamorph-run.mjs"]
