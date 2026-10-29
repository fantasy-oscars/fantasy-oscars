#!/usr/bin/env bash
# GitHub helpers for alert issues and heartbeats in the monitoring repo.
# Source this file; do not execute it. Needs curl and jq.
# Settings: GH_MONITOR_TOKEN (fine-grained, that repo only: Issues RW + Contents RW),
#           GH_MONITOR_REPO (owner/name). FO_DRYRUN=1 prints instead of calling GitHub.
# shellcheck shell=bash

FO_GH_API="${FO_GH_API:-https://api.github.com}"

gh_dry() { [ "${FO_DRYRUN:-0}" = 1 ]; }

# gh_api METHOD PATH [JSON_BODY] -> body on stdout; non-zero when HTTP status >= 300.
gh_api() {
  local method="$1" path="$2" body="${3:-}" out hdr status
  : "${GH_MONITOR_TOKEN:?GH_MONITOR_TOKEN is not set}" "${GH_MONITOR_REPO:?GH_MONITOR_REPO is not set}"
  out="$(mktemp)"
  hdr="$(umask 077 && mktemp)"
  # The token goes through a 600 header file (curl -H @file), never through argv / ps.
  printf 'Authorization: Bearer %s\n' "$GH_MONITOR_TOKEN" >"$hdr"
  local args=(-sS -o "$out" -w '%{http_code}' -X "$method" -H "@$hdr"
    -H "Accept: application/vnd.github+json"
    -H "X-GitHub-Api-Version: 2022-11-28")
  if [ -n "$body" ]; then
    args+=(-H "Content-Type: application/json" --data "$body")
  fi
  status="$(curl "${args[@]}" "$FO_GH_API/repos/$GH_MONITOR_REPO$path")" || {
    rm -f "$out" "$hdr"
    return 1
  }
  cat "$out"
  rm -f "$out" "$hdr"
  if [ "$status" -ge 300 ]; then
    echo "github: $method $path -> HTTP $status" >&2
    return 1
  fi
}

# gh_ensure_label NAME COLOR  (an "already exists" 422 is fine)
gh_ensure_label() {
  gh_dry && return 0
  gh_api POST /labels "$(jq -nc --arg n "$1" --arg c "$2" '{name:$n,color:$c}')" >/dev/null 2>&1 || true
}

# gh_issue_find_open TITLE LABEL -> issue number or empty
gh_issue_find_open() {
  gh_dry && return 0
  gh_api GET "/issues?state=open&labels=$2&per_page=100" |
    jq -r --arg t "$1" '[.[] | select(.title == $t and (has("pull_request") | not))][0].number // empty'
}

# gh_issue_state NUMBER -> "open", "closed" or "missing" (HTTP 404). Other failures return 1.
gh_issue_state() {
  local err out
  err="$(mktemp)"
  if out="$(gh_api GET "/issues/$1" 2>"$err")"; then
    rm -f "$err"
    printf '%s' "$out" | jq -r '.state'
  elif grep -q 'HTTP 404' "$err"; then
    rm -f "$err"
    echo missing
  else
    cat "$err" >&2
    rm -f "$err"
    return 1
  fi
}

# gh_issue_create TITLE LABEL BODY -> issue number
gh_issue_create() {
  gh_api POST /issues "$(jq -nc --arg t "$1" --arg l "$2" --arg b "$3" '{title:$t,body:$b,labels:[$l]}')" |
    jq -r '.number'
}

gh_issue_comment() {
  gh_api POST "/issues/$1/comments" "$(jq -nc --arg b "$2" '{body:$b}')" >/dev/null
}

gh_issue_close() {
  gh_api PATCH "/issues/$1" '{"state":"closed","state_reason":"completed"}' >/dev/null
}

# gh_heartbeat NAME [DETAIL] -> writes heartbeats/NAME.json via the Contents API.
gh_heartbeat() {
  local name="$1" detail="${2:-}" path content sha body
  path="heartbeats/$name.json"
  if gh_dry; then
    echo "DRYRUN heartbeat $path"
    return 0
  fi
  content="$(jq -nc --arg n "$name" --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg h "$(hostname)" --arg d "$detail" '{name:$n,timestamp:$t,host:$h,detail:$d}' | base64 | tr -d '\n')"
  sha="$(gh_api GET "/contents/$path" 2>/dev/null | jq -r '.sha // empty' || true)"
  body="$(jq -nc --arg m "heartbeat: $name" --arg c "$content" --arg s "$sha" \
    '{message:$m,content:$c} + (if $s == "" then {} else {sha:$s} end)')"
  gh_api PUT "/contents/$path" "$body" >/dev/null
}
