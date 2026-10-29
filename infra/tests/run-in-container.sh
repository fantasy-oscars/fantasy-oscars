#!/usr/bin/env bash
# Run the infra tests inside a throwaway ubuntu:24.04 container (GNU userland, like the VPS).
#
#   infra/tests/run-in-container.sh tests       heartbeat-check, healthcheck, backup/restore round trip
#   infra/tests/run-in-container.sh provision   provision.sh twice in a clean container
#
# "tests" mounts the Docker socket so the round trip can start sibling postgres containers.
# Everything it creates is named fo-ops-* and removed afterwards.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:-tests}"
NAME="fo-ops-test-$$"
trap 'docker rm -f -v "$NAME" >/dev/null 2>&1 || true' EXIT

case "$MODE" in
  tests)
    docker run --name "$NAME" -v "$ROOT:/w:ro" -v /var/run/docker.sock:/var/run/docker.sock \
      ubuntu:24.04 bash -c '
        set -euo pipefail
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y -qq --no-install-recommends ca-certificates curl jq age rclone openssl python3 docker.io >/dev/null
        cd /w
        bash infra/tests/heartbeat-check.sh
        bash infra/tests/healthcheck.sh
        bash infra/tests/roundtrip.sh
      '
    ;;
  health)
    docker run --name "$NAME" -v "$ROOT:/w:ro" ubuntu:24.04 bash -c '
        set -euo pipefail
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y -qq --no-install-recommends ca-certificates curl jq openssl python3 >/dev/null 2>&1
        cd /w
        bash infra/tests/healthcheck.sh
      '
    ;;
  calendar)
    # Validate the OnCalendar expressions with the real systemd-analyze.
    docker run --name "$NAME" -v "$ROOT/infra/systemd:/u:ro" ubuntu:24.04 bash -c '
        set -euo pipefail
        apt-get update -qq
        apt-get install -y -qq --no-install-recommends systemd tzdata >/dev/null 2>&1
        grep -h "^OnCalendar=" /u/*.timer | sort -u | sed "s/^OnCalendar=//" | while IFS= read -r c; do
          echo "--- $c"
          systemd-analyze calendar --iterations=2 "$c" | grep -E "Normalized|Next elapse|Original|Iter"
        done
        echo "--- Jan 14 / Jan 15 / Mar 31 / Apr 1 coverage"
        systemd-analyze calendar --iterations=3 --base-time=2027-01-14T12:00:00Z "*-01-15..31 *:17:00 America/Los_Angeles" | grep -E "Next|Iter"
        systemd-analyze calendar --iterations=2 --base-time=2027-03-31T12:00:00Z "*-02..03-* *:17:00 America/Los_Angeles" | grep -E "Next|Iter"
        systemd-analyze calendar --iterations=2 --base-time=2027-04-01T00:00:00Z "*-02..03-* *:17:00 America/Los_Angeles" | grep -E "Next|Iter"
      '
    ;;
  provision)
    docker run --name "$NAME" -v "$ROOT/infra:/src/infra:ro" ubuntu:24.04 bash -c '
        set -euo pipefail
        apt-get update -qq
        apt-get install -y -qq --no-install-recommends ca-certificates curl openssh-client >/dev/null
        ssh-keygen -q -t ed25519 -N "" -C admin@example -f /tmp/ak; AK="$(cat /tmp/ak.pub)"
        ssh-keygen -q -t ed25519 -N "" -C ci@example -f /tmp/dk; DK="$(cat /tmp/dk.pub)"
        echo "######## RUN -1 (invalid key must be refused)"
        OUT="$(bash /src/infra/provision.sh --admin-key "ssh-ed25519 AAAAnotarealkey broken" --deploy-key "$DK" 2>&1 || true)"; if echo "$OUT" | grep -qE "invalid admin SSH"; then echo "OK: invalid key refused"; else echo "FAIL: invalid key accepted"; exit 1; fi
        test ! -d /home/admin && echo "OK: nothing written for the invalid key"
        echo "######## RUN 0 (no admin key: must refuse to harden sshd)"
        bash /src/infra/provision.sh --deploy-key "$DK" --site-host www.example.test | grep -E "NOT applied|sshd"
        test ! -e /etc/ssh/sshd_config.d/00-fantasy-oscars.conf && echo "OK: no sshd drop-in written without an admin key"
        echo "######## RUN 1"
        bash /src/infra/provision.sh --admin-key "$AK" --deploy-key "$DK" --site-host www.example.test
        echo "######## RUN 2"
        bash /src/infra/provision.sh --admin-key "$AK" --deploy-key "$DK" --site-host www.example.test
        echo "######## CHECKS"
        sshd -T 2>/dev/null | grep -E "^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|authenticationmethods) "
        ls -l /srv/fantasy-oscars/.env; stat -c "%a %U" /srv/fantasy-oscars/.env
        cat /srv/fantasy-oscars/.env
        cat /etc/docker/daemon.json
        cat /etc/apt/apt.conf.d/52fantasy-oscars-upgrades
        docker --version; docker compose version; rclone version | head -1; age --version; jq --version
        id admin; id deploy; cat /etc/sudoers.d/fo-admin; sshd -T 2>/dev/null | grep -i "^allowusers"; sudo -l -U deploy; grep -c ssh-ed25519 /home/admin/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys; ls -la /srv/fantasy-oscars
        cat /etc/sudoers.d/fo-deploy
        ls /etc/systemd/system/fo-*
        ls -l /swapfile
      '
    ;;
  *)
    echo "usage: $0 tests|health|calendar|provision" >&2
    exit 2
    ;;
esac
