#!/usr/bin/env bash
# Provision (or re-provision) the production VPS. Ubuntu 26.04 or 24.04 LTS, run as root. Idempotent.
#
#   sudo infra/provision.sh --admin-key "ssh-ed25519 AAAA... me@laptop" \
#                           --deploy-key "ssh-ed25519 AAAA... github-actions" [--site-host HOST]
#   Environment alternatives: ADMIN_SSH_KEYS / DEPLOY_SSH_KEYS (one key per line).
#   Options: --admin-key KEY, --deploy-key KEY        (repeatable)
#            --admin-key-file FILE, --deploy-key-file FILE   public keys, one per line
#            --site-host HOST   written to .env as SITE_HOST when that key is empty
#
# Users: "admin" (owner's personal keys, NOPASSWD sudo, docker and log access) and "deploy"
# (CI key, runs the timers and the app; docker group; sudo only for `systemctl reboot`).
# Root SSH login and password logins are disabled; sshd is NOT hardened unless admin has a key.
# Also: ufw, fail2ban, unattended security upgrades (no auto reboot), swap, UTC + timesyncd,
# Docker Engine + compose plugin (Docker's apt repo, key fingerprint pinned), rclone
# (pinned version, signed checksums), age, jq, /srv/fantasy-oscars + .env template, and the
# systemd timers. Steps that need a real host (systemd, ufw, swapon, sysctl) are skipped with
# a note when the script runs in a container.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_USER="${ADMIN_USER:-admin}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
INSTALL_DIR="${FO_INSTALL_DIR:-/srv/fantasy-oscars}"
STATE_DIR="${FO_STATE_DIR:-/var/lib/fantasy-oscars}"
SWAP_SIZE_MB="${SWAP_SIZE_MB:-2048}"
RCLONE_VERSION="${RCLONE_VERSION:-v1.69.1}"
SITE_HOST_ARG="${SITE_HOST:-}"

# Docker's apt signing key (https://download.docker.com/linux/ubuntu/gpg), primary fingerprint.
DOCKER_KEY_FPR="9DC858229FC7DD38854AE2D88D81803C0EBFCD88"
# rclone release signing keys (https://rclone.org/KEYS), primary fingerprints, checked against
# the key published there on 2026-10-29. The SHA256SUMS file is PGP-clearsigned by one of them.
RCLONE_KEY_FPRS="FBF737ECE9F8AB18604BD2AC93935E02FF3B54FA E3B358DC858FB307F48170B9CB0DBEBC5F32C81D"

CHANGED=()
SKIPPED=()
ADMIN_KEYS=()
DEPLOY_KEYS=()

log() { printf '==> %s\n' "$*"; }
changed() { CHANGED+=("$*"); }
skipped() { SKIPPED+=("$*"); }
die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

read_keys_file() { # FILE ARRAYNAME
  local l
  local -n target="$2"
  [ -r "$1" ] || die "cannot read $1"
  while IFS= read -r l; do
    [ -z "$l" ] || target+=("$l")
  done <"$1"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --admin-key)
      ADMIN_KEYS+=("${2:?--admin-key needs a value}")
      shift 2
      ;;
    --deploy-key)
      DEPLOY_KEYS+=("${2:?--deploy-key needs a value}")
      shift 2
      ;;
    --admin-key-file)
      read_keys_file "${2:?--admin-key-file needs a file}" ADMIN_KEYS
      shift 2
      ;;
    --deploy-key-file)
      read_keys_file "${2:?--deploy-key-file needs a file}" DEPLOY_KEYS
      shift 2
      ;;
    --site-host)
      SITE_HOST_ARG="${2:?--site-host needs a value}"
      shift 2
      ;;
    -h | --help)
      sed -n '2,19p' "$0"
      exit 0
      ;;
    *) die "unknown argument: $1" ;;
  esac
done
while IFS= read -r l; do
  [ -z "$l" ] || ADMIN_KEYS+=("$l")
done <<<"${ADMIN_SSH_KEYS:-}"
while IFS= read -r l; do
  [ -z "$l" ] || DEPLOY_KEYS+=("$l")
done <<<"${DEPLOY_SSH_KEYS:-}"

[ "$(id -u)" -eq 0 ] || die "run as root (sudo)"
os_field() { sed -n "s/^$1=//p" /etc/os-release 2>/dev/null | head -1 | tr -d '"'; }
if [ -r /etc/os-release ]; then
  [ "$(os_field ID)" = ubuntu ] || die "expected Ubuntu, found $(os_field ID)"
  case "$(os_field VERSION_ID)" in
    26.04 | 24.04) ;;
    *) echo "WARNING: tested on Ubuntu 26.04 and 24.04 LTS, found $(os_field VERSION_ID)" >&2 ;;
  esac
fi
UBUNTU_CODENAME="$(os_field UBUNTU_CODENAME)"

HAVE_SYSTEMD=0
[ -d /run/systemd/system ] && HAVE_SYSTEMD=1

# install_file DEST MODE OWNER:GROUP  (content on stdin). Returns 0 and records a change if it
# differed, 1 when the file was already up to date.
install_file() {
  local dest="$1" mode="$2" owner="$3" tmp
  tmp="$(mktemp)"
  cat >"$tmp"
  mkdir -p "$(dirname "$dest")"
  if [ -f "$dest" ] && cmp -s "$tmp" "$dest"; then
    rm -f "$tmp"
    chmod "$mode" "$dest"
    chown "$owner" "$dest"
    return 1
  fi
  install -m "$mode" -o "${owner%%:*}" -g "${owner##*:}" "$tmp" "$dest"
  rm -f "$tmp"
  changed "wrote $dest"
  return 0
}

export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------- packages
APT_UPDATED=0
apt_update_once() {
  if [ "$APT_UPDATED" = 0 ]; then
    apt-get update -qq
    APT_UPDATED=1
  fi
}
apt_ensure() {
  local missing=() p
  for p in "$@"; do
    dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    apt_update_once
    apt-get install -y -qq --no-install-recommends "${missing[@]}"
    changed "installed packages: ${missing[*]}"
  fi
}

log "base packages"
apt_ensure ca-certificates curl gnupg sudo ufw fail2ban unattended-upgrades \
  openssh-server age jq tzdata cron

# ---------------------------------------------------------------- users
# ensure_user NAME KEYS...
ensure_user() {
  local user="$1" home ak k
  shift
  if ! id "$user" >/dev/null 2>&1; then
    adduser --disabled-password --gecos "" "$user" >/dev/null
    changed "created user $user"
  fi
  home="$(getent passwd "$user" | cut -d: -f6)"
  install -d -m 700 -o "$user" -g "$user" "$home/.ssh"
  ak="$home/.ssh/authorized_keys"
  touch "$ak"
  chmod 600 "$ak"
  chown "$user:$user" "$ak"
  for k in "$@"; do
    if ! grep -qxF "$k" "$ak"; then
      echo "$k" >>"$ak"
      changed "added an SSH key to $user"
    fi
  done
}
has_key() { [ -s "$(getent passwd "$1" | cut -d: -f6)/.ssh/authorized_keys" ]; }

log "users"
# Refuse malformed keys before anything is written to authorized_keys.
validate_keys() { # ROLE KEYS...
  local role="$1" k tmp
  shift
  for k in "$@"; do
    tmp="$(mktemp)"
    printf '%s\n' "$k" >"$tmp"
    if ! ssh-keygen -l -f "$tmp" >/dev/null 2>&1; then
      rm -f "$tmp"
      die "invalid $role SSH public key (ssh-keygen -l rejected it): ${k:0:60}..."
    fi
    rm -f "$tmp"
  done
}
validate_keys admin "${ADMIN_KEYS[@]}"
validate_keys deploy "${DEPLOY_KEYS[@]}"
ensure_user "$ADMIN_USER" "${ADMIN_KEYS[@]}"
ensure_user "$DEPLOY_USER" "${DEPLOY_KEYS[@]}"
for g in sudo systemd-journal adm; do
  getent group "$g" >/dev/null && usermod -aG "$g" "$ADMIN_USER"
done
install_file /etc/sudoers.d/fo-admin 440 root:root <<EOF || true
$ADMIN_USER ALL=(ALL) NOPASSWD:ALL
EOF
# deploy has no general sudo: the idle-reboot job may reboot, nothing else.
install_file /etc/sudoers.d/fo-deploy 440 root:root <<EOF || true
$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl reboot
EOF
visudo -cf /etc/sudoers.d/fo-admin >/dev/null || die "admin sudoers drop-in is invalid"
visudo -cf /etc/sudoers.d/fo-deploy >/dev/null || die "deploy sudoers drop-in is invalid"
has_key "$DEPLOY_USER" || echo "WARNING: $DEPLOY_USER has no SSH key yet; CI deploys cannot connect (pass --deploy-key)" >&2

# ---------------------------------------------------------------- sshd
log "sshd hardening"
if ! has_key "$ADMIN_USER"; then
  skipped "sshd hardening NOT applied: $ADMIN_USER has no SSH key (pass --admin-key); refusing to lock you out"
else
  mkdir -p /run/sshd /etc/ssh/sshd_config.d
  [ -f /etc/ssh/ssh_host_ed25519_key ] || ssh-keygen -A >/dev/null
  SSHD_DROPIN=/etc/ssh/sshd_config.d/00-fantasy-oscars.conf
  PREV=""
  if [ -f "$SSHD_DROPIN" ]; then
    PREV="$(mktemp)"
    cp "$SSHD_DROPIN" "$PREV"
  fi
  if install_file "$SSHD_DROPIN" 644 root:root <<EOF; then
# Managed by fantasy-oscars infra/provision.sh. Sorts before cloud-init's 50-*.conf, and
# sshd keeps the first value it sees, so these win.
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
AllowUsers $ADMIN_USER $DEPLOY_USER
MaxAuthTries 3
X11Forwarding no
EOF
    if sshd -t; then
      if [ "$HAVE_SYSTEMD" = 1 ]; then
        systemctl reload ssh 2>/dev/null || systemctl reload sshd
        changed "reloaded sshd"
      else
        skipped "sshd reload (no systemd); config validated with sshd -t"
      fi
    else
      # Roll back the bad config rather than leave sshd unable to reload.
      if [ -n "$PREV" ]; then cp "$PREV" "$SSHD_DROPIN"; else rm -f "$SSHD_DROPIN"; fi
      die "sshd -t rejected the drop-in; rolled it back"
    fi
  else
    sshd -t || die "existing sshd configuration is invalid"
  fi
  [ -z "$PREV" ] || rm -f "$PREV"
fi

# ---------------------------------------------------------------- firewall
log "ufw"
if ufw status >/dev/null 2>&1 && [ "$HAVE_SYSTEMD" = 1 ]; then
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null # HTTP/3 (udp) is disabled in Caddy
  if ufw status | grep -q "Status: inactive"; then
    ufw --force enable >/dev/null
    changed "enabled ufw (deny incoming; allow 22, 80, 443/tcp)"
  fi
else
  skipped "ufw rules not applied (no systemd/iptables in this environment)"
fi

# ---------------------------------------------------------------- fail2ban
log "fail2ban"
install_file /etc/fail2ban/jail.d/fantasy-oscars.local 644 root:root <<'EOF' || true
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
if [ "$HAVE_SYSTEMD" = 1 ]; then
  systemctl enable --now fail2ban >/dev/null 2>&1
  systemctl reload fail2ban >/dev/null 2>&1 || true
else
  skipped "fail2ban service start (no systemd)"
fi

# ---------------------------------------------------------------- unattended upgrades
log "unattended-upgrades"
install_file /etc/apt/apt.conf.d/20auto-upgrades 644 root:root <<'EOF' || true
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
install_file /etc/apt/apt.conf.d/52fantasy-oscars-upgrades 644 root:root <<'EOF' || true
// Security updates only (default Ubuntu origins). Reboots are done by
// fo-reboot-when-idle.timer, which waits for live drafts to finish.
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF

# ---------------------------------------------------------------- time
log "timezone and time sync"
if [ "$HAVE_SYSTEMD" = 1 ]; then
  if [ "$(timedatectl show -p Timezone --value)" != UTC ]; then
    timedatectl set-timezone UTC
    changed "timezone set to UTC"
  fi
  systemctl enable --now systemd-timesyncd >/dev/null 2>&1 || skipped "systemd-timesyncd could not be enabled"
else
  if [ "$(cat /etc/timezone 2>/dev/null)" != UTC ]; then
    ln -sf /usr/share/zoneinfo/UTC /etc/localtime
    echo UTC >/etc/timezone
    changed "timezone set to UTC"
  fi
  skipped "systemd-timesyncd (no systemd)"
fi

# ---------------------------------------------------------------- swap
log "swap and sysctl"
SWAPFILE=/swapfile
if [ ! -f "$SWAPFILE" ]; then
  if fallocate -l "${SWAP_SIZE_MB}M" "$SWAPFILE" 2>/dev/null || dd if=/dev/zero of="$SWAPFILE" bs=1M count="$SWAP_SIZE_MB" status=none; then
    chmod 600 "$SWAPFILE"
    mkswap "$SWAPFILE" >/dev/null
    changed "created ${SWAP_SIZE_MB} MB swapfile"
  else
    skipped "swapfile could not be created"
  fi
fi
if [ -f "$SWAPFILE" ]; then
  if ! grep -qE "^${SWAPFILE}[[:space:]]" /etc/fstab; then
    echo "$SWAPFILE none swap sw 0 0" >>/etc/fstab
    changed "added swapfile to /etc/fstab"
  fi
  if ! swapon --show=NAME --noheadings 2>/dev/null | grep -qx "$SWAPFILE"; then
    if swapon "$SWAPFILE" 2>/dev/null; then
      changed "enabled swap"
    else
      skipped "swapon not permitted here (container?)"
    fi
  fi
fi
install_file /etc/sysctl.d/99-fantasy-oscars.conf 644 root:root <<'EOF' || true
vm.swappiness = 10
EOF
sysctl -q -p /etc/sysctl.d/99-fantasy-oscars.conf >/dev/null 2>&1 || skipped "sysctl vm.swappiness not applied live (container?); it applies at next boot"

# ---------------------------------------------------------------- docker
log "docker engine"
# docker_key_fingerprints FILE -> primary key fingerprints, one per line
docker_key_fingerprints() { gpg --show-keys --with-colons "$1" 2>/dev/null | awk -F: '$1 == "pub" {want=1; next} $1 == "fpr" && want {print $10; want=0}'; }
DOCKER_KEY=/etc/apt/keyrings/docker.asc
if [ ! -f "$DOCKER_KEY" ]; then
  install -m 0755 -d /etc/apt/keyrings
  TMPKEY="$(mktemp)"
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o "$TMPKEY"
  docker_key_fingerprints "$TMPKEY" | grep -qx "$DOCKER_KEY_FPR" ||
    die "downloaded Docker apt key does not have the expected fingerprint $DOCKER_KEY_FPR; refusing to trust it"
  install -m 0644 "$TMPKEY" "$DOCKER_KEY"
  rm -f "$TMPKEY"
  changed "installed Docker apt signing key (fingerprint verified)"
fi
docker_key_fingerprints "$DOCKER_KEY" | grep -qx "$DOCKER_KEY_FPR" ||
  die "$DOCKER_KEY does not have the expected fingerprint $DOCKER_KEY_FPR; remove it and re-run"
if install_file /etc/apt/sources.list.d/docker.sources 644 root:root <<EOF; then
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-noble}
Components: stable
Signed-By: $DOCKER_KEY
EOF
  APT_UPDATED=0
fi

DAEMON_JSON=/etc/docker/daemon.json
DAEMON_WANT='{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}'
mkdir -p /etc/docker
if [ -s "$DAEMON_JSON" ]; then
  MERGED="$(jq -S -s '.[0] * .[1]' "$DAEMON_JSON" <(echo "$DAEMON_WANT"))"
else
  MERGED="$(echo "$DAEMON_WANT" | jq -S .)"
fi
DAEMON_CHANGED=0
install_file "$DAEMON_JSON" 644 root:root <<<"$MERGED" && DAEMON_CHANGED=1

apt_ensure docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
if [ "$HAVE_SYSTEMD" = 1 ]; then
  systemctl enable --now docker >/dev/null 2>&1
  if [ "$DAEMON_CHANGED" = 1 ] && systemctl is-active --quiet docker; then
    # Log options apply to newly created containers; the daemon must restart to read them.
    systemctl restart docker
    changed "restarted docker to apply daemon.json (restart policies bring containers back)"
  fi
else
  skipped "docker service start (no systemd)"
fi
for u in "$ADMIN_USER" "$DEPLOY_USER"; do
  id -nG "$u" | tr ' ' '\n' | grep -qx docker || {
    usermod -aG docker "$u"
    changed "added $u to the docker group"
  }
done

# ---------------------------------------------------------------- rclone
log "rclone $RCLONE_VERSION"
if ! command -v rclone >/dev/null || ! rclone version 2>/dev/null | head -1 | grep -qF "${RCLONE_VERSION}"; then
  ARCH="$(dpkg --print-architecture)"
  DEB="rclone-${RCLONE_VERSION}-linux-${ARCH}.deb"
  TMP="$(mktemp -d)"
  curl -fsSL "https://downloads.rclone.org/${RCLONE_VERSION}/${DEB}" -o "$TMP/$DEB"
  curl -fsSL "https://downloads.rclone.org/${RCLONE_VERSION}/SHA256SUMS" -o "$TMP/SHA256SUMS"
  curl -fsSL "https://rclone.org/KEYS" -o "$TMP/KEYS"
  # SHA256SUMS is PGP-clearsigned. Accept it only if signed by a key whose fingerprint is
  # pinned above, then check the .deb against it.
  GNUPGHOME="$TMP/gnupg"
  export GNUPGHOME
  install -d -m 700 "$GNUPGHOME"
  gpg --batch --quiet --import "$TMP/KEYS" 2>/dev/null
  SIGNER="$(gpg --batch --status-fd 1 --verify "$TMP/SHA256SUMS" 2>/dev/null | awk '$2 == "VALIDSIG" {print $NF}')"
  unset GNUPGHOME
  case " $RCLONE_KEY_FPRS " in
    *" $SIGNER "*) [ -n "$SIGNER" ] ;;
    *) die "rclone SHA256SUMS is not signed by a pinned key (signer: ${SIGNER:-none})" ;;
  esac
  (cd "$TMP" && grep " ${DEB}\$" SHA256SUMS | sha256sum -c - >/dev/null) || die "rclone checksum mismatch"
  apt-get install -y -qq "$TMP/$DEB" >/dev/null
  rm -rf "$TMP"
  changed "installed rclone ${RCLONE_VERSION} (signature and checksum verified)"
fi

# ---------------------------------------------------------------- app dirs, infra, .env
log "install directory"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$INSTALL_DIR"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$STATE_DIR"

# /srv/fantasy-oscars/infra mirrors the repo tree exactly (the deploy workflow replaces it the
# same way); state never lives there.
mkdir -p "$INSTALL_DIR/infra"
if [ "$(cd "$SCRIPT_DIR" && pwd -P)" != "$(cd "$INSTALL_DIR/infra" && pwd -P)" ]; then
  STAGE="$(mktemp -d)"
  (cd "$SCRIPT_DIR" && tar --exclude=./monitoring-repo --exclude=./tests -cf - .) | (cd "$STAGE" && tar -xf -)
  if ! diff -rq "$STAGE" "$INSTALL_DIR/infra" >/dev/null 2>&1; then
    rm -rf "$INSTALL_DIR/infra.new"
    cp -a "$STAGE" "$INSTALL_DIR/infra.new"
    chown -R "$DEPLOY_USER:$DEPLOY_USER" "$INSTALL_DIR/infra.new"
    chmod +x "$INSTALL_DIR"/infra.new/*.sh "$INSTALL_DIR"/infra.new/lib/*.sh
    rm -rf "$INSTALL_DIR/infra.old"
    mv "$INSTALL_DIR/infra" "$INSTALL_DIR/infra.old"
    mv "$INSTALL_DIR/infra.new" "$INSTALL_DIR/infra"
    rm -rf "$INSTALL_DIR/infra.old"
    changed "synced infra/ to $INSTALL_DIR/infra"
  fi
  rm -rf "$STAGE"
fi

ENV_FILE="$INSTALL_DIR/.env"
# KEY|required(1)/optional(0)|comment. Optional keys are written commented out.
ENV_SPEC=(
  "POSTGRES_PASSWORD|1|Database password. Hex/alphanumeric ONLY (openssl rand -hex 24): it is interpolated into DATABASE_URL."
  "AUTH_SECRET|1|Signs login tokens. Copy the current Render value to keep sessions alive. Changing it signs everyone out."
  "SITE_HOST|1|Public web host, e.g. www.fantasy-oscars.com (TLS certificate check and Caddy site)."
  "APEX_HOST|1|Apex host that redirects to SITE_HOST, e.g. fantasy-oscars.com."
  "API_ALIAS_HOST|1|Legacy API host alias, e.g. api.fantasy-oscars.com. Staging: set APEX_HOST= and API_ALIAS_HOST= EMPTY (unset means the production defaults)."
  "ACME_EMAIL|1|Contact email for Let's Encrypt certificates."
  "POSTGRES_USER|0|Optional; default fantasy."
  "POSTGRES_DB|0|Optional; default fantasy_oscars."
  "CORS_ALLOWED_ORIGINS|0|Optional; default https://\$SITE_HOST. Must include the site origin even in same-origin mode."
  "ADMIN_BOOTSTRAP_SECRET|0|Optional; one-time secret for the admin bootstrap script."
  "TMDB_READ_ACCESS_TOKEN|0|Optional; nominee poster lookups."
  "TMDB_API_TOKEN|0|Optional; alternative TMDB credential."
  "SENTRY_DSN|0|Optional; error tracking."
  "SENTRY_ENVIRONMENT|0|Optional; label for Sentry events."
  "BACKUP_AGE_RECIPIENT|1|age PUBLIC key (age1...). The private key lives only in the owner's password manager."
  "BACKUP_BUCKET|1|Backup bucket name."
  "BACKUP_S3_PROVIDER|1|Cloudflare (R2) or Other (Backblaze B2)."
  "BACKUP_S3_ENDPOINT|1|R2: https://<account>.r2.cloudflarestorage.com  B2: https://s3.<region>.backblazeb2.com"
  "BACKUP_S3_REGION|1|R2: auto  B2: e.g. us-west-004"
  "BACKUP_S3_ACCESS_KEY_ID|1|Bucket-scoped access key id."
  "BACKUP_S3_SECRET_ACCESS_KEY|1|Bucket-scoped secret key."
  "GH_MONITOR_REPO|1|Monitoring repo as owner/name (public repo, no secrets in it)."
  "GH_MONITOR_TOKEN|1|Fine-grained token for that repo only: Issues RW + Contents RW."
)
if [ ! -f "$ENV_FILE" ]; then
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /dev/null "$ENV_FILE"
  echo "# Fantasy Oscars production secrets. Mode 600, owner $DEPLOY_USER. Never commit. Fill in every value." >"$ENV_FILE"
  changed "created $ENV_FILE template (keys only)"
fi
chmod 600 "$ENV_FILE"
chown "$DEPLOY_USER:$DEPLOY_USER" "$ENV_FILE"
ADDED_KEYS=()
for spec in "${ENV_SPEC[@]}"; do
  IFS='|' read -r k req comment <<<"$spec"
  grep -qE "^#?$k=" "$ENV_FILE" && continue
  value=""
  if [ "$k" = SITE_HOST ] && [ -n "$SITE_HOST_ARG" ]; then value="$SITE_HOST_ARG"; fi
  {
    echo "# $comment"
    if [ "$req" = 1 ]; then echo "$k=$value"; else echo "#$k="; fi
  } >>"$ENV_FILE"
  ADDED_KEYS+=("$k")
done
[ "${#ADDED_KEYS[@]}" -eq 0 ] || changed "added keys to .env: ${ADDED_KEYS[*]}"

# ---------------------------------------------------------------- timers
log "systemd timers"
UNIT_SRC="$SCRIPT_DIR/systemd"
UNITS_CHANGED=0
for u in "$UNIT_SRC"/*.service "$UNIT_SRC"/*.timer; do
  name="$(basename "$u")"
  sed -e "s|@INSTALL_DIR@|$INSTALL_DIR|g" -e "s|@DEPLOY_USER@|$DEPLOY_USER|g" "$u" |
    install_file "/etc/systemd/system/$name" 644 root:root && UNITS_CHANGED=1
done
if [ "$HAVE_SYSTEMD" = 1 ]; then
  [ "$UNITS_CHANGED" = 0 ] || systemctl daemon-reload
  for t in "$UNIT_SRC"/*.timer; do
    systemctl enable --now "$(basename "$t")" >/dev/null
  done
else
  skipped "timers written to /etc/systemd/system but not enabled (no systemd)"
fi

# ---------------------------------------------------------------- summary
echo
echo "================ provision summary ================"
if [ "${#CHANGED[@]}" -eq 0 ]; then
  echo "Changed: nothing (already provisioned)"
else
  echo "Changed:"
  printf '  - %s\n' "${CHANGED[@]}"
fi
if [ "${#SKIPPED[@]}" -gt 0 ]; then
  echo "Skipped / not verifiable here:"
  printf '  - %s\n' "${SKIPPED[@]}"
fi
echo "Next: fill in $ENV_FILE (sudo -u $DEPLOY_USER nano $ENV_FILE), then see docs/runbooks/vps.md."
echo "Before closing this SSH session, confirm a second session can log in as $ADMIN_USER and has sudo."
