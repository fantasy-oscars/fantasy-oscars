# Runbook: VPS (single-host production)

Production runs on one Vultr Cloud Compute instance (Ubuntu 26.04 LTS, 1 GB RAM, US West, about $5–6/month) with Docker Compose. Host provisioning, backups, health checks and alerting live in `infra/`; the compose stack, Caddy config, images and `deploy.sh` come from the runtime package. Alerts are GitHub issues in a separate **public** monitoring repository that GitHub emails and pushes to the owner. No paid service is used beyond the VPS.

## Architecture

```text
Browser ──443──> web (Caddy: static files, TLS, /api -> api, websockets)  ──> api (Express + Socket.IO)
                                                                              │
                                                                              └──> db (postgres 18, no published ports)

Host (timers run as the deploy user): systemd timers
  fo-backup            nightly 03:00 Pacific   pg_dump -> age -> rclone -> bucket  (+ weekly copy on Sundays)
  fo-backup-hourly     hourly, Jan 15 - Mar 31 (awards season), :17 past the hour
  fo-healthcheck       every 10 min            disk, memory, containers, TLS, API 5xx, pending reboot
  fo-reboot-when-idle  04:00 Pacific           reboot if /var/run/reboot-required and zero live drafts
  fo-verify-restore    2nd of the month        fresh dump -> scratch postgres:18.6 -> row-count compare

Monitoring repo (public, GitHub):
  Upptime every 5 min -> https://www.fantasy-oscars.com/api/health/ready   (issue if down)
  heartbeats/{backup,healthcheck,restore-verify}.json  <- written by the server
  heartbeat-check workflow daily -> issue if a heartbeat is stale
```

Paths and names (the contract between `infra/` and the runtime package):

| Thing           | Value                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install dir     | `/srv/fantasy-oscars` (owner `deploy`)                                                                                                                                  |
| Secrets         | `/srv/fantasy-oscars/.env`, mode 600, owner `deploy`                                                                                                                    |
| Ops scripts     | `/srv/fantasy-oscars/infra/` (the repo's `infra/` tree; replaced atomically on every deploy by the workflow, under the deploy lock; `provision.sh` seeds the same tree) |
| State           | `/var/lib/fantasy-oscars` (alert state, counters, backup lock; never inside `infra/`)                                                                                   |
| Compose file    | copied by `deploy.sh` to `/srv/fantasy-oscars/compose.yaml`                                                                                                             |
| Deploy state    | `IMAGE_TAG` in `/srv/fantasy-oscars/.env-deploy`; `deploy-state` with `current=` and `previous=`, both written by the scripts (do not edit by hand)                     |
| Deploy logs     | `/srv/fantasy-oscars/logs/` (30-day retention)                                                                                                                          |
| Data volume     | Postgres 18 data volume mounts at `/var/lib/postgresql` (PG18 layout)                                                                                                   |
| Ad hoc compose  | `cd /srv/fantasy-oscars && docker compose -p fantasy-oscars ...`                                                                                                        |
| Compose project | `fantasy-oscars`; services `db`, `api`, `web` (the only one publishing 80/443), `migrate` (profile `tools`)                                                             |
| Active drafts   | `infra/lib/active-drafts.sh` prints the number of `IN_PROGRESS` drafts                                                                                                  |

Settings read from `.env` by the ops scripts (the application's own keys are defined by the compose file):

| Key                                                      | Meaning                                                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `SITE_HOST`                                              | Host name whose TLS certificate is checked, e.g. `www.fantasy-oscars.com`                      |
| `BACKUP_AGE_RECIPIENT`                                   | age **public** key (`age1...`). The private key is never on the server                         |
| `BACKUP_BUCKET`                                          | Bucket name                                                                                    |
| `BACKUP_S3_PROVIDER`                                     | `Cloudflare` for R2, `Other` for Backblaze B2                                                  |
| `BACKUP_S3_ENDPOINT`                                     | R2: `https://<account-id>.r2.cloudflarestorage.com`. B2: `https://s3.<region>.backblazeb2.com` |
| `BACKUP_S3_REGION`                                       | R2: `auto`. B2: the region in the endpoint, e.g. `us-west-004`                                 |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | Bucket-scoped key                                                                              |
| `GH_MONITOR_REPO`                                        | `owner/name` of the monitoring repo                                                            |
| `GH_MONITOR_TOKEN`                                       | Fine-grained token for that repo only (Issues RW, Contents RW)                                 |

Application keys in the same `.env` (the template written by `provision.sh` has all of them with comments):

| Key                                                                                                      | Notes                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                                                                                      | Required. Hex or alphanumeric only (it is interpolated into `DATABASE_URL`)                                                                       |
| `AUTH_SECRET`                                                                                            | Required. Copy Render's value to keep existing sessions valid                                                                                     |
| `SITE_HOST`, `APEX_HOST`, `API_ALIAS_HOST`, `ACME_EMAIL`                                                 | Hosts Caddy serves and the Let's Encrypt contact. **Staging:** set `APEX_HOST=` and `API_ALIAS_HOST=` empty (unset means the production defaults) |
| `POSTGRES_USER` (default `fantasy`), `POSTGRES_DB` (default `fantasy_oscars`)                            | Optional                                                                                                                                          |
| `CORS_ALLOWED_ORIGINS`                                                                                   | Optional, default `https://$SITE_HOST`. Must include the site origin even in same-origin mode                                                     |
| `ADMIN_BOOTSTRAP_SECRET`, `TMDB_READ_ACCESS_TOKEN`, `TMDB_API_TOKEN`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | Optional                                                                                                                                          |

Keep `LOG_FORMAT` unset (or `json`) on the API: the health check counts 5xx responses by parsing the JSON request log lines (`{"msg":"request","status":503,...}`).

## First-time setup

Do these in order. Nothing here needs a paid service other than the server.

### 1. Accounts and keys the owner creates

1. **Vultr instance.** Deploy a new server with:
   - **Type:** Cloud Compute, shared CPU. Either _High Performance_ (1 vCPU / 1 GB / 25 GB NVMe, about $6) or _Regular Performance_ (1 vCPU / 1 GB / 25 GB SSD, about $5); the stack idles at about 110 MB of memory and either is enough.
   - **Location:** Silicon Valley or Seattle (closest to the old Render region, US West).
   - **Image:** Ubuntu 26.04 LTS x64 (24.04 LTS also works). Never an interim release such as 26.10, which loses security updates after nine months. No Marketplace app.
   - **SSH key:** add your personal public key (it logs in as `root` only for the one-time provisioning step). Vultr also shows a root password on the server page; it stops working for SSH once `provision.sh` disables password and root logins, but keep it for the web console.
   - **Auto backups:** off (see "Monthly cost"). IPv6 optional. Note the public IPv4 address.
   - **Vultr Firewall (free, recommended):** Network, Firewall, add a group with inbound rules TCP 22, 80 and 443 (IPv4 and IPv6) and link the instance to it. It filters traffic before it reaches the server, so it also backs up the fact that Docker bypasses ufw. Leave 22 open to all addresses: GitHub Actions deploys from changing IPs, and SSH is key-only with fail2ban.
2. **SSH keys.** Two separate roles. Your personal key(s) become the `admin` user (full sudo, used for everything privileged). A **separate** key pair belongs to GitHub Actions and becomes the `deploy` user (runs the app, the timers and deploys; no sudo except `systemctl reboot`):

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/fo_deploy -C "github-actions-deploy" -N ""
   ```

   Your personal public key goes to `provision.sh --admin-key`, the deploy public key to `--deploy-key`. The deploy **private** key goes into the GitHub secret `DEPLOY_SSH_KEY`. Root SSH login is disabled once provisioning finishes.

3. **age keypair** (on your laptop, not the server):

   ```bash
   age-keygen -o fantasy-oscars-backup.agekey      # prints "Public key: age1..."
   ```

   Put the **entire file** in your password manager (this is the only way to decrypt backups; losing it makes every backup unreadable). The `age1...` public key goes into `BACKUP_AGE_RECIPIENT`. Delete the file from the laptop once stored, or keep a copy only in encrypted storage.

4. **Backup bucket (free tier).** Recommended: **Backblaze B2** (10 GB free, no per-request fees at this size). Create a private bucket and an application key restricted to that bucket (read, write, list, delete). Alternative: **Cloudflare R2** (10 GB-month, 1M Class A and 10M Class B operations free, free egress): create a bucket and an R2 API token with Object Read & Write on that bucket; the endpoint is shown on the bucket page. See "What was verified" below. Encrypted dumps are about 0.1 MB each now, so 40 or so objects are far below 10 GB either way.
5. **Monitoring repo.** See "Monitoring repository setup" below, then create the fine-grained token for it.
6. **GitHub (app repo) settings:**
   - Create an **environment** named `production` (Settings, Environments) and put these secrets in it: `DEPLOY_HOST` (server IP or host name), `DEPLOY_SSH_KEY` (private key from step 2), `DEPLOY_KNOWN_HOSTS` (output of `ssh-keyscan -t ed25519 <host>`, verified against the server's own fingerprint: open the instance's web console in Vultr (View Console), log in as root and run `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`).
   - Repository variable `DEPLOY_ENABLED` = `true` **only after** the server is provisioned and `.env` is filled in (until then pushes to `main` skip the deploy).
   - Images are pushed to GHCR with the workflow's own `GITHUB_TOKEN`; no registry secret is needed. After the **first** image push, set both packages (`fantasy-oscars-api`, `fantasy-oscars-web`) to **Public** once (GitHub profile, Packages, package settings, Change visibility) so the server can pull without credentials.

### 2. Provision the host

From a checkout on your laptop:

```bash
scp -r infra root@<server-ip>:/root/infra
ssh root@<server-ip> 'bash /root/infra/provision.sh \
  --admin-key "$(cat ~/.ssh/id_ed25519.pub)" \
  --deploy-key "$(cat ~/.ssh/fo_deploy.pub)" \
  --site-host www.fantasy-oscars.com'
```

The script is idempotent; re-run it any time (for example after pulling new `infra/` changes) and read the summary it prints. It refuses to harden sshd unless `admin` has at least one key. Before closing the root session, open a second terminal and check `ssh admin@<server-ip> sudo whoami` prints `root`; from then on root cannot log in. Later re-runs: `ssh admin@<server-ip>`, then `sudo /srv/fantasy-oscars/infra/provision.sh --admin-key ... --deploy-key ...` (keys already installed are left alone; pass at least the admin key).

What it configures: two users, `admin` (your keys, NOPASSWD sudo, `docker`, `adm` and `systemd-journal` groups) and `deploy` (CI key, `docker` group), key-only SSH restricted to those two users with no root login (`/etc/ssh/sshd_config.d/00-fantasy-oscars.conf`, checked with `sshd -t` before reload), ufw (deny incoming; allow 22/tcp, 80/tcp, 443/tcp; HTTP/3 is off in Caddy, so no UDP), fail2ban for sshd, unattended security upgrades with automatic reboot **off**, 2 GB swap with `vm.swappiness=10`, UTC with systemd-timesyncd, Docker Engine and the compose plugin from Docker's apt repository (the repository key is only trusted if its fingerprint is `9DC8 5822 9FC7 DD38 854A E2D8 8D81 803C 0EBF CD88`) with json-file log rotation (10 MB x 3), rclone (pinned version; the signed `SHA256SUMS` must verify against one of two pinned rclone release-key fingerprints, then the `.deb` is checked against it; note the key file itself is fetched from rclone.org, so the pinned fingerprints, recorded on 2026-10-29, are the trust anchor), age, jq, `/srv/fantasy-oscars` (the `infra/` copy there mirrors the repo exactly and is replaced by each deploy; nothing else lives in it, state is in `/var/lib/fantasy-oscars`), the `.env` template, a sudoers rule that lets `deploy` run exactly `systemctl reboot`, and the five systemd timers.

**Security note:** membership of the `docker` group is root-equivalent (anyone who can run `docker` can mount the host filesystem). Both `admin` and `deploy` are in it, so guard the **deploy SSH private key** (the GitHub environment secret) like a root key, keep the `production` environment restricted, and rotate it if anything about GitHub access is in doubt.

Note: Docker publishes container ports by writing iptables rules that bypass ufw. Only `web` publishes ports (80/443) and `db` publishes none, so this is safe; do not add `ports:` to `db` or `api`.

### 3. Fill in `.env`

```bash
ssh admin@<server-ip>
sudo -u deploy nano /srv/fantasy-oscars/.env      # owner deploy, mode 600; fill every key
```

The template lists every key with a comment (see the application key table above). Store a copy of the file in your password manager as well; the server also uploads an age-encrypted copy weekly, but you need this one to bootstrap a new server.

### 4. First deploy, then first runs of the ops jobs

The first deploy's health check needs working DNS and a Let's Encrypt certificate, which you do not have before cutover. So deploy first to a **staging** host: set `SITE_HOST=<server-ip>.sslip.io` (for example `203.0.113.7.sslip.io`, which resolves to that IP), leave `APEX_HOST=` and `API_ALIAS_HOST=` empty, set `ACME_EMAIL`, set `DEPLOY_ENABLED=true` and run the deploy workflow (manual dispatch). At cutover switch `.env` to the real hosts (`SITE_HOST=www.fantasy-oscars.com`, `APEX_HOST=fantasy-oscars.com`, `API_ALIAS_HOST=api.fantasy-oscars.com`) and deploy again. Then, as `admin` on the server, prove each job works and seed the heartbeats so the monitoring repo does not alert about files that do not exist yet:

```bash
sudo systemctl start fo-backup.service && journalctl -u fo-backup.service -n 20 --no-pager
sudo systemctl start fo-healthcheck.service && journalctl -u fo-healthcheck.service -n 20 --no-pager
sudo systemctl start fo-verify-restore.service && journalctl -u fo-verify-restore.service -n 30 --no-pager
systemctl list-timers 'fo-*'
```

### 5. Phase E: test restore with the real private key (required, then quarterly)

Run this **on your laptop**, from the app repo. It needs only `ssh` (with the `admin` key) and Docker; the private key never leaves the laptop:

```bash
infra/restore-local.sh            # newest daily backup -> throwaway postgres:18.6 container, prints row counts
```

The server streams the encrypted object over SSH; decryption (`age`, in a throwaway container) and the restore happen locally. Defaults: host `FO_HOST` (the server IP), SSH key `~/.ssh/fo_admin`, age identity `~/.ssh/fo_backup_age.key` (recreate that file from the password manager entry if needed: one line, `AGE-SECRET-KEY-...`, mode 600). `--file daily/<name>` picks a specific backup. The automated monthly job cannot decrypt (no private key on the server), so this manual restore is the only proof that the key in your password manager really opens the backups. Repeat it every three months and after any key rotation.

## Monitoring repository setup

The repo is **public** so GitHub Actions minutes are free and unlimited. It holds no code and no secrets.

1. Open <https://github.com/upptime/upptime/generate> ("Use this template"), name it (for example `fantasy-oscars-monitoring`), set it to **Public**, and tick **Include all branches** (Upptime's status site lives on `gh-pages`).
2. Copy the contents of `infra/monitoring-repo/` over the new repo's files (`.upptimerc.yml`, `README.md`, `.github/workflows/heartbeat-check.yml`, `scripts/check-heartbeats.sh`), replace `OWNER` and `REPO` in `.upptimerc.yml`, and commit to the default branch.
3. Create the Upptime token: a fine-grained personal access token for **only** this repo with Actions, Contents, Issues and Workflows read-write, expiry 90 days or longer; store it as the repository secret `GH_PAT` (Upptime's documented option; a GitHub App is the alternative). Put a calendar reminder to renew it before it expires; if it lapses, Upptime workflows fail but the heartbeat check and the server's own alerts keep working.
4. Actions tab: enable workflows; run "Setup CI" once if Upptime did not start itself. Settings, Pages: serve from the `gh-pages` branch.
5. Create the **server's** token: Settings, Developer settings, Fine-grained tokens, resource owner = you, **only this repository**, permissions Issues: read and write, Contents: read and write (Metadata read is added automatically). Put it in `.env` as `GH_MONITOR_TOKEN`, and the repo name in `GH_MONITOR_REPO`.
6. Create the `alert` label once if you like (`healthcheck.sh` and the workflow also create it on first use).

How scheduled workflows stay alive: GitHub disables scheduled workflows in public repos when "no repository activity has occurred in 60 days". The monitoring repo is never idle: Upptime commits status changes, summaries and response-time data on its own schedules, and the server commits a heartbeat file every day (backup, health check) and monthly (restore verification) through the Contents API. GitHub's documentation does not define exactly which events count as activity, so if the repo were ever to go quiet, re-enable workflows from the Actions tab; the daily heartbeat commits are the backstop. GitHub's cron is also best-effort, so "every 5 minutes" often runs several minutes late; expect a downtime issue to lag a real outage by 5 to 15 minutes.

## Notifications

On the monitoring repo: Watch, Custom, tick **Issues** (this sends an email for each new issue and comment). In GitHub, Settings, Notifications: enable email and **GitHub Mobile** push (install the app, sign in, allow notifications). Because the repo is public and Upptime assigns downtime issues to you, you get notified even without watching, but watch it anyway so alert issues from the server and the heartbeat workflow also arrive. Make sure the notification email address is one you read on your phone.

## Deploy and rollback

- **When it runs:** every push to `main` that passes CI deploys (docs-only changes too), as long as the repository variable `DEPLOY_ENABLED` is `true`. The workflow connects as `deploy`, replaces `/srv/fantasy-oscars/infra` atomically under the deploy lock, copies the compose file to `/srv/fantasy-oscars/compose.yaml`, and starts `deploy.sh` **detached** on the server; the workflow then follows its log, so a dropped connection does not kill the deploy.
- **What `deploy.sh` does:**
  1. Refuses while a draft is `IN_PROGRESS` (manual dispatch with `force` overrides).
  2. Takes a pre-deploy backup with `infra/backup.sh --reason pre-deploy`; the deploy fails if the backup fails, or if `infra/backup.sh` is missing (unless `FO_ALLOW_NO_BACKUP=1`). The backup is skipped only on a true first deploy (no deploy-state and no pgdata volume).
  3. Pulls images, runs migrations with lock and statement timeouts, restarts services.
  4. Verifies the running tag and HTTPS health, and **rolls back automatically** to the previous tag if either fails.
- **Where to look:** deploy logs are in `/srv/fantasy-oscars/logs/` (30 days). `deploy-state` holds `current=` and `previous=`; `IMAGE_TAG` lives in `.env-deploy`. Both are written by the scripts; do not edit them. Ad hoc inspection: `cd /srv/fantasy-oscars && docker compose -p fantasy-oscars ps` (and `logs <service>`), as `admin` (docker group) or `deploy`.
- **Manual rollback:** run the workflow by manual dispatch with the `tag` input (only tags built from `main` are accepted), or on the server `cd /srv/fantasy-oscars && sudo -u deploy infra/rollback.sh <tag>`. Check `https://www.fantasy-oscars.com/api/health/ready` afterwards.
- **Migrations are never reverted.** Rolling back the image does not undo a migration. If a migration must be undone, restore the `pre-deploy` backup taken just before it (see Restore); restoring replaces the whole database, so expect to lose writes made since.
- Pre-deploy backups keep the last 10 under `pre-deploy/`.
- **Dependabot** watches the Dockerfiles and the compose file. On its first run, check that it detects `infra/compose.prod.yml` (the file `deploy.sh` copies to `compose.yaml`); if it does not, add that path to `.github/dependabot.yml`.

## Backups

| Prefix         | Created by                                     | Kept |
| -------------- | ---------------------------------------------- | ---- |
| `daily/`       | nightly 03:00 Pacific                          | 14   |
| `weekly/`      | the Sunday daily run copies its dump here      | 8    |
| `hourly/`      | Jan 15 - Mar 31 only, :17 past each hour       | 48   |
| `pre-deploy/`  | `backup.sh --reason pre-deploy` (every deploy) | 10   |
| `pre-restore/` | safety dump before a production restore        | 5    |
| `config/`      | weekly age-encrypted copy of `.env`            | 8    |

Dumps are `pg_dump -Fc` taken inside the `db` container, encrypted with age to `BACKUP_AGE_RECIPIENT`, uploaded with rclone. Retention is enforced by the script. Only the encrypted `.age` objects are stored remotely. The `backup` heartbeat is written only after a successful scheduled (nightly) run, not for hourly, pre-deploy or pre-restore runs. Once the upload is verified the backup counts as done even if the housekeeping afterwards (weekly copy, encrypted `.env`, retention pruning) fails; that raises a separate `[alert] backup-retention` issue and a failed `fo-backup.service` instead of a stale heartbeat. The monthly job checks the dump is restorable and the upload is intact, but it cannot decrypt; see Phase E.

## Restore

Run restores as the `deploy` user (it owns `.env` and talks to Docker), from the install directory because `deploy` cannot enter `admin`'s home: `cd /srv/fantasy-oscars && sudo -u deploy infra/restore.sh ...`. For anything that touches production, start a `tmux` session first (or prefix the command with `nohup` and read `nohup.out`) so a dropped SSH connection cannot kill it halfway; the script restarts `api` and re-enables connections on exit either way. The age private key is never copied to the server. Decrypt on your laptop with `infra/restore-local.sh` and hand the server a plaintext dump for `--local-dump` (below).

```bash
infra/restore.sh list                              # on the server: what is in the bucket
infra/restore-local.sh [--file weekly/<name>]      # on your laptop: decrypt + verify in a throwaway container
```

Row counts printed: `app_user league season draft draft_pick draft_seat ceremony category_edition nomination film person`.

**Into production** (replaces the live database; run on the server as `deploy`; add `--force` to proceed while drafts are in progress, which you almost never want):

```bash
# 1. Laptop: decrypt the chosen backup to a plaintext dump
infra/restore-local.sh --file pre-deploy/fo-pre-deploy-<stamp>.dump.age --output ~/restore.dump
# 2. Laptop: copy it to the server where deploy can read it
scp -i ~/.ssh/fo_admin ~/restore.dump admin@<server-ip>:/tmp/restore.dump
ssh -i ~/.ssh/fo_admin admin@<server-ip> 'sudo install -o deploy -m 600 /tmp/restore.dump /var/lib/fantasy-oscars/restore.dump && rm /tmp/restore.dump'
# 3. Server (as admin, inside tmux): restore it, then delete the plaintext copies
sudo -u deploy bash -c 'cd /srv/fantasy-oscars && infra/restore.sh restore --local-dump /var/lib/fantasy-oscars/restore.dump --into-production --i-understand'
sudo rm /var/lib/fantasy-oscars/restore.dump   # and on the laptop: rm ~/restore.dump
```

This is the procedure that was used for the Render cutover.

The procedure is all-or-nothing:

1. Refuses when `infra/lib/active-drafts.sh` reports drafts in progress (or cannot tell), unless `--force`. It also takes the deploy lock for the whole run (and the backup lock once the safety dump is done) and fails with a clear message if a deploy or backup is running.
2. Takes a `pre-restore` safety dump of the live database (kept in the bucket for 5 runs).
3. Stops `api`.
4. Creates a fresh database `<db>_restore` and runs `pg_restore --single-transaction --exit-on-error` into it, so a bad dump changes nothing.
5. Swaps names in one step: the live database becomes `<db>_old_<utc-stamp>` (connections disabled) and `<db>_restore` becomes `<db>`. Because the new database comes entirely from the dump, objects created later (for example by a newer migration) are gone and `migration_history` matches the dump. After restoring an older dump, redeploy so the matching images and migrations are in place.
6. Always restarts `api` (also on failure) and prints production row counts.

If it fails before the swap, production is untouched and `api` is restarted. After a successful restore the old database is kept; once you are satisfied, drop it (`sudo docker compose ... exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE \"<db>_old_<stamp>\""'`). **Recovery path** if the restored data is wrong: stop `api`, then in `psql -d postgres` run `UPDATE pg_database SET datallowconn = true WHERE datname = '<db>_old_<stamp>'`, rename the current `<db>` to something else and rename `<db>_old_<stamp>` back to `<db>`, start `api`. If the old database is already gone, restore the `pre-restore/` safety dump the same way (it is the state just before the restore).

## Rebuild the server from scratch

1. Create a new Vultr instance (steps 1 and 2 of first-time setup) and run `provision.sh` with the same admin and deploy keys. Point `DEPLOY_HOST` (and `DEPLOY_KNOWN_HOSTS`) at it.
2. Restore `/srv/fantasy-oscars/.env`: from your password manager copy, or decrypt the newest `config/` object on your laptop (`infra/restore-local.sh --file config/<name> --output ~/fo.env`, run against any server that still has the bucket settings, or with rclone directly) and `scp` it over (mode 600).
3. Run the deploy workflow. It brings up an empty database with migrations applied.
4. Restore the data: decrypt the newest `daily/` file on your laptop (`infra/restore-local.sh --output ~/restore.dump`), copy it over and run `infra/restore.sh restore --local-dump ... --into-production --i-understand --force` as in "Into production" above (`--force` because the empty database cannot answer the active-drafts query); delete the plaintext copies.
5. Move DNS to the new IP (TTL 600 s keeps the switch fast). Caddy obtains a certificate once DNS points at the new host.
6. Run the ops jobs once (first-time setup step 4).

## Rotating secrets

| Secret                                        | Procedure                                                                                                                                                                                                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy SSH key                                | Generate a new pair, as `admin`, append the public key to `/home/deploy/.ssh/authorized_keys` (`sudo -u deploy tee -a`), update `DEPLOY_SSH_KEY` in GitHub, run a deploy, then remove the old public key line.                                                 |
| Your admin SSH key                            | As `admin`: add the new key to `/home/admin/.ssh/authorized_keys` (or re-run `provision.sh --admin-key`), confirm you can log in with it, then delete the old line.                                                                                            |
| `DEPLOY_KNOWN_HOSTS`                          | Only after reinstalling the host: `ssh-keyscan -t ed25519 <host>` and update the secret.                                                                                                                                                                       |
| `GH_MONITOR_TOKEN`                            | Create a new fine-grained token (same scope), edit `.env` (`sudo -u deploy nano`), run `sudo systemctl start fo-healthcheck.service`, revoke the old token. Tokens expire; set a reminder.                                                                     |
| Upptime `GH_PAT`                              | New token with the same permissions, update the repository secret, revoke the old one.                                                                                                                                                                         |
| Bucket key                                    | Create a new bucket-scoped key, update the three `BACKUP_*` key fields in `.env`, run `fo-backup.service`, delete the old key.                                                                                                                                 |
| age keypair                                   | Generate a new pair, store the private key, set the new `BACKUP_AGE_RECIPIENT`. Old backups still need the **old** private key; keep it until the last backup encrypted to it has aged out (14 days daily, 8 weeks weekly), then run Phase E with the new key. |
| App secrets (`AUTH_SECRET`, DB password, ...) | Edit `.env`, redeploy. Changing `AUTH_SECRET` signs everyone out. Changing the Postgres password also requires `ALTER USER` inside the db container.                                                                                                           |

## Alerts: meaning and first response

Run the commands below as `admin` over SSH (`admin` is in the `docker` group; use `sudo` for systemd and system files). Server alerts are issues titled `[alert] <key>` with label `alert`. One issue per key; it is commented on at most every 6 hours while it persists and is closed automatically with a comment when the condition clears.

| Issue                                                | Meaning                                                                                                       | First response                                                                                                                                                                                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[alert] disk-usage`                                 | `/` or Docker data above 80%                                                                                  | `ssh`, `df -h`, `docker system df`. Safe cleanup: `docker image prune -f` (dangling only), `journalctl --vacuum-time=7d`, `sudo apt-get clean`. Do not prune volumes. If it keeps growing, find the cause (log volume, dumps in `/var/lib/fantasy-oscars`).  |
| `[alert] memory-pressure`                            | MemAvailable below 10% for 3 runs (30 min), or swap above 50%                                                 | `free -m`, `docker stats --no-stream`. Restart the heaviest service (`docker compose -p fantasy-oscars restart api`). If recurring, check for a leak in the API logs or upgrade the plan in Vultr (Settings, Change Plan).                                   |
| `[alert] container-health`                           | A container is unhealthy, restarting, missing, or its restart count rose                                      | `docker compose -p fantasy-oscars ps -a`, `docker compose -p fantasy-oscars logs --tail 100 <service>`. If `db` is down, do not delete its volume; restore from backup only after checking the logs. Redeploy the previous image if a release broke `api`.   |
| `[alert] tls-expiry`                                 | Certificate for `SITE_HOST` expires in under 14 days (or cannot be read)                                      | Caddy renews automatically at 30 days left; renewal is failing. Check `docker compose -p fantasy-oscars logs web`, that ports 80/443 are open (`sudo ufw status`), and that DNS still points at this host.                                                   |
| `[alert] api-5xx`                                    | More than 5 API responses with 5xx status in 10 minutes                                                       | `docker compose -p fantasy-oscars logs --since 15m api` and look for `request_error` lines with their `error` field. Check `/api/health/ready`. If it followed a deploy, roll back.                                                                          |
| `[alert] reboot-pending`                             | Security updates need a reboot that has been waiting more than 3 days (live drafts kept blocking it)          | When no draft is live, run `sudo systemctl reboot`. Containers use a restart policy and return on their own; confirm `/api/health/ready`.                                                                                                                    |
| `[alert] backup-retention`                           | A backup was uploaded, but the weekly copy, encrypted `.env` upload or old-backup pruning failed              | The backup itself is safe. `journalctl -u fo-backup.service -n 80`; usually bucket credentials or a transient outage. Fix, then `sudo systemctl start fo-backup.service`; the issue closes after the next clean nightly run.                                 |
| `[alert] old-database` (label `low-priority`)        | A `<db>_old_<stamp>` database kept by a production restore is more than 14 days old                           | Reminder only. If the restored data is fine, drop it: `cd /srv/fantasy-oscars && docker compose -p fantasy-oscars exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE \"<db>_old_<stamp>\""'`.                                          |
| `[alert] heartbeat-stale` (monitoring repo workflow) | `backup` or `healthcheck` heartbeat older than 26 h, or `restore-verify` older than 35 days; or never written | The server may be down or the job is failing. `systemctl list-timers 'fo-*'`, `journalctl -u fo-backup.service -n 50`. A failed backup run exits non-zero and shows in the journal. Run the job by hand once the cause is fixed.                             |
| Downtime issue (Upptime)                             | `/api/health/ready` returned non-200 or timed out                                                             | Open the site, `ssh` in, `docker compose -p fantasy-oscars ps`, then logs. 503 means the database is unreachable or migrations are behind. If SSH also fails, use the Vultr web console (View Console) or restart the instance from the Vultr control panel. |

A silent server cannot raise its own alerts; that is why the heartbeat check and Upptime run from GitHub.

## Cutover from Render (checklist)

DNS is at GoDaddy. Email forwarding runs on ImprovMX: **never edit or delete the MX or the SPF/TXT records.**

1. **At least 48 hours ahead:** lower the TTL to **600 seconds** (GoDaddy's minimum, 10 minutes) on the apex `A` record and the `www` and `api` records. Leave MX and TXT alone.
2. Provision and deploy the VPS, fill `.env`, run Phase E on a backup of a dev/seed database if you want a rehearsal. Verify the stack by IP or via a hosts-file entry: `curl --resolve www.fantasy-oscars.com:443:<ip> https://www.fantasy-oscars.com/api/health/ready` (Caddy may only get a certificate after DNS moves; use `-k` for the rehearsal).
3. **Render database access:** in the Render Postgres dashboard, Access Control, add the IP you will dump from (the VPS IP, or your own) to the external allow list. Copy the external connection string.
4. **Freeze writes:** suspend the Render API service (or put the site in read-only/maintenance if you have one). Note the time.
5. **Final dump and restore.** On the VPS as `admin` (the client image is 18.6, newer than the Render server). `restore.sh` stops `api`, restores into a fresh database in one transaction, swaps it in and restarts `api`; `--force` is needed because the fresh database has no tables for the active-drafts check, and this is the first load anyway:

   ```bash
   docker run --rm postgres:18.6 pg_dump -Fc --no-owner "<render external url>" > /tmp/render.dump
   sudo chown deploy /tmp/render.dump
   cd /srv/fantasy-oscars && sudo -u deploy infra/restore.sh restore --local-dump /tmp/render.dump --into-production --i-understand --force
   ```

   It prints production row counts when done. Do not use `pg_restore --clean` by hand; the script's procedure leaves nothing from the previous database behind.

6. **Compare row counts** between Render and the VPS for the key tables:

   ```bash
   Q="select 'app_user',count(*) from app_user union all select 'league',count(*) from league union all select 'season',count(*) from season union all select 'draft',count(*) from draft union all select 'draft_pick',count(*) from draft_pick union all select 'ceremony',count(*) from ceremony union all select 'nomination',count(*) from nomination union all select 'film',count(*) from film union all select 'person',count(*) from person"
   docker run --rm postgres:18.6 psql "<render external url>" -Atc "$Q"
   cd /srv/fantasy-oscars && sudo -u deploy bash -c '. infra/lib/ops.sh; fo_load_env; fo_row_counts compose-db'
   ```

   Every line must match. Then run the app's pending migrations if any (the deploy does this), and `shred -u /tmp/render.dump`.

7. **Switch DNS** in GoDaddy: apex `A` to the VPS IP; `www` and `api` records to the VPS (a `CNAME` cannot coexist with an `A` for the same name, so replace the Render CNAMEs with `A` records pointing at the VPS IP, or CNAME them to the apex). Do not touch `MX` or `TXT`.
8. Wait for propagation (up to the 10-minute TTL), then check: `dig +short www.fantasy-oscars.com`, `curl -I https://www.fantasy-oscars.com/api/health/ready`, sign in, open a draft room and confirm the websocket connects. Caddy gets its certificate on the first request after DNS moves.
9. Confirm the GitHub variable `DEPLOY_ENABLED` is still `true` (set during the staging deploy) and push or dispatch a deploy so the real hosts are live. Start the monitoring-repo checks if not already running. Force `sudo systemctl start fo-backup.service` and confirm the heartbeat.
10. Keep Render read-only/suspended for a week as a rollback path (repoint DNS to Render to roll back; data written on the VPS since cutover would be lost, so decide quickly or dump/restore back). Then remove the VPS IP from the Render access list and delete the Render services and database.
11. Raise the TTL back to an hour or more once stable.

## Monthly cost

| Item                                                                           | Cost            |
| ------------------------------------------------------------------------------ | --------------- |
| Vultr Cloud Compute, 1 GB / 1 vCPU / 25 GB (Regular $5 or High Performance $6) | $5.00–6.00      |
| Backup storage (B2 or R2 free tier, well under 10 GB)                          | $0              |
| GitHub (public monitoring repo, Actions, notifications)                        | $0              |
| GHCR images                                                                    | $0              |
| Domain renewal (GoDaddy, already paid separately)                              | existing        |
| Optional Vultr automatic backups add-on (about 20% of the plan, about $1–1.20) | not recommended |

Vultr automatic backups are recommended **against**: they are whole-disk snapshots of a live database (crash-consistent only), daily or weekly at best, restorable only into Vultr, and they die with the account. The encrypted nightly (and hourly in season) dumps cover data loss more precisely and portably, and the server is rebuildable from the runbook above in under an hour. If you want an extra safety net during awards season for $1.20, the weekly add-on is reasonable, but it is optional.

## What was verified and what was not

Checked against vendor pages while writing this (October 2026):

- Cloudflare R2 free tier: 10 GB-month storage, 1 million Class A and 10 million Class B operations per month, free egress (developers.cloudflare.com/r2/pricing). The R2 getting-started page says to complete a checkout flow to add an R2 subscription, so a payment method is likely required even for the free tier; this was **not** confirmed.
- Backblaze B2: first 10 GB free, then about $6.95 per TB-month; egress free up to 3x stored data. Whether a credit card is needed to sign up for the free tier could **not** be confirmed from the pages available. This is why B2 is the first choice (you can try it with no commitment) and R2 the fallback; if both demand a card, a card on file is fine as long as usage stays inside the free tier.
- Docker apt key: fingerprint `9DC858229FC7DD38854AE2D88D81803C0EBFCD88` read from download.docker.com and pinned in `provision.sh`; apt also verifies Docker's repository metadata with it.
- rclone: its `SHA256SUMS` is PGP-clearsigned; `provision.sh` accepts it only when signed by one of two pinned fingerprints (`FBF737EC...54FA`, `E3B358DC...C81D`, observed in rclone.org/KEYS on 2026-10-29), then checks the `.deb` against it. This protects against a tampered download, not against a compromise of the fingerprints' real owner, and the pins themselves were recorded over TLS from rclone.org (not cross-checked against a second source). The signature uses an old DSA-1024/SHA-1 key.
- Vultr: 1 GB Cloud Compute at $5 (Regular) and $6 (High Performance) per month, per third-party listings in October 2026; check the plan page when ordering. The automatic backups add-on is about 20% of the plan price. Vultr Firewall groups are free. Vultr's own guides describe ufw on its Ubuntu images as installed but inactive; `provision.sh` adds its rules before enabling ufw, so it works either way.
- GitHub: scheduled workflows in public repos are disabled after 60 days without repository activity; the docs do not define "activity" (see above).
- Upptime: option names (`sites`, `expectedStatusCodes`, `maxResponseTime`, `assignees`, `workflowSchedule`, `commitMessages`, `status-website.baseUrl`), the `GH_PAT` secret and "Include all branches" were read from upptime.js.org. There is no documented option to turn the status website off, so it is published at `https://<owner>.github.io/<repo>`.

Not verified: behaviour on a real server (systemd timers, ufw, sshd reload, swapon, sysctl, docker restart) and live GitHub/R2/B2 calls; these were exercised only against a container and a fake GitHub API (see the tests in `infra/tests/`). Run through first-time setup step 4 on the real host and watch the journal.
