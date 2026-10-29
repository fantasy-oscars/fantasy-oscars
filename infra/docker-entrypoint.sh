#!/bin/sh
# Web image entrypoint: render the optional Caddy pieces from the environment, then
# hand over to Caddy. POSIX sh so it runs on the alpine base image.
set -eu

: "${SITE_HOST:?SITE_HOST must be set}"
upstream="${API_UPSTREAM:-api:4000}"

mkdir -p /etc/caddy/global.d /etc/caddy/sites.d
rm -f /etc/caddy/global.d/* /etc/caddy/sites.d/*

if [ -n "${ACME_EMAIL:-}" ]; then
  printf 'email %s\n' "$ACME_EMAIL" >/etc/caddy/global.d/email.caddy
fi

if [ "${CADDY_LOCAL_CERTS:-false}" = "true" ]; then
  printf 'local_certs\n' >/etc/caddy/global.d/local-certs.caddy
fi

if [ -n "${APEX_HOST:-}" ] && [ "$APEX_HOST" != "$SITE_HOST" ]; then
  cat >/etc/caddy/sites.d/apex.caddy <<BLOCK
${APEX_HOST} {
	redir https://${SITE_HOST}{uri} permanent
}
BLOCK
fi

if [ -n "${API_ALIAS_HOST:-}" ] && [ "$API_ALIAS_HOST" != "$SITE_HOST" ]; then
  cat >/etc/caddy/sites.d/api-alias.caddy <<BLOCK
${API_ALIAS_HOST} {
	import security_headers
	encode zstd gzip
	reverse_proxy ${upstream}
}
BLOCK
fi

caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
