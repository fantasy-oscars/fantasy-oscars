# Fantasy Oscars monitoring

**This repository is public. It contains no code from the app and no secrets.**
Anything written here (issues, heartbeat files, workflow runs) is visible to everyone, so
nothing sensitive belongs in it. Credentials live only in GitHub Actions secrets and on the
server.

What it holds:

- `.upptimerc.yml`: [Upptime](https://upptime.js.org) uptime checks for the site every 5 minutes (GitHub's scheduler is best-effort, so runs can be late). A failing check opens a GitHub issue.
- `heartbeats/*.json`: written by the server (backup, health check, restore verification) to prove the jobs are still running. Each file contains a timestamp and the host name, nothing else.
- `.github/workflows/heartbeat-check.yml`: runs daily; opens or updates one issue when a heartbeat is older than its limit (backup and health check 26 hours, restore verification 35 days) and closes it when the heartbeats are fresh again. The logic is in `scripts/check-heartbeats.sh`.
- Issues labelled `alert`: opened by the server's health check or by the workflows above.

Setup and operations are documented in the app repository at `docs/runbooks/vps.md`.
