#!/usr/bin/env bash
# One GitHub issue per alert key. Source after ops.sh and github.sh.
# State: $FO_STATE_DIR/alerts/<key>.state holds "<issue-number> <last-comment-epoch>".
# alert_set KEY firing|clear [DETAIL] [LABEL]
# While firing, the tracked issue is commented on at most every FO_ALERT_REPEAT_SECS (6h).
# If the tracked issue was closed by hand or no longer exists (404), the state is dropped and a
# fresh issue is opened (or an existing open one with the same title is reused).
# shellcheck shell=bash

FO_ALERT_LABEL="${FO_ALERT_LABEL:-alert}"
FO_ALERT_REPEAT_SECS="${FO_ALERT_REPEAT_SECS:-21600}"
FO_ALERT_FAILED=0

alert_set() {
  local key="$1" mode="$2" detail="${3:-}" label="${4:-$FO_ALERT_LABEL}" state num last now title st
  state="$FO_STATE_DIR/alerts/$key.state"
  title="[alert] $key"
  now="$(date +%s)"
  num=""
  last=0
  if [ -f "$state" ]; then read -r num last <"$state" || true; fi

  if [ "$mode" = firing ]; then
    if [ -n "$num" ] && ! gh_dry; then
      st="$(gh_issue_state "$num")" || {
        FO_ALERT_FAILED=1
        return 0
      }
      if [ "$st" != open ]; then
        echo "ALERT STALE   $key: tracked issue #$num is $st; opening a new one"
        rm -f "$state"
        num=""
      fi
    fi
    if [ -z "$num" ]; then
      echo "ALERT OPEN    $key: $detail"
      gh_dry && return 0
      num="$(gh_issue_find_open "$title" "$label")" || {
        FO_ALERT_FAILED=1
        return 0
      }
      if [ -z "$num" ]; then
        num="$(gh_issue_create "$title" "$label" "$detail"$'\n\nHost: '"$(hostname)"$'\nFirst response: docs/runbooks/vps.md (Alerts) in the app repo.')" || {
          FO_ALERT_FAILED=1
          return 0
        }
      else
        gh_issue_comment "$num" "Firing again: $detail" || {
          FO_ALERT_FAILED=1
          return 0
        }
      fi
      mkdir -p "$FO_STATE_DIR/alerts"
      echo "$num $now" >"$state"
    elif [ $((now - last)) -ge "$FO_ALERT_REPEAT_SECS" ]; then
      echo "ALERT COMMENT $key: $detail"
      gh_dry && return 0
      gh_issue_comment "$num" "Still firing: $detail" || {
        FO_ALERT_FAILED=1
        return 0
      }
      echo "$num $now" >"$state"
    fi
  else
    [ -n "$num" ] || return 0
    echo "ALERT CLOSE   $key (issue #$num): ${detail:-condition cleared}"
    gh_dry && return 0
    st="$(gh_issue_state "$num")" || {
      FO_ALERT_FAILED=1
      return 0
    }
    if [ "$st" = open ]; then
      if gh_issue_comment "$num" "Condition cleared${detail:+: $detail}. Closing." && gh_issue_close "$num"; then
        rm -f "$state"
      else
        FO_ALERT_FAILED=1
      fi
    else
      # Already closed by hand or deleted: nothing to close, just forget it.
      rm -f "$state"
    fi
  fi
}
