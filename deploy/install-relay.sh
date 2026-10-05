#!/usr/bin/env bash
set -euo pipefail
umask 022

[[ $(uname -s) == Linux && $(id -u) == 0 ]] || { echo 'Run on the Ubuntu relay server as root.' >&2; exit 1; }
bundle_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
for file in server/index.mjs server/package.json server/package-lock.json deploy/kalmar-arena.service deploy/nginx-arena.conf; do
  [[ -f "$bundle_root/$file" ]] || { echo "Missing bundle file: $file" >&2; exit 1; }
done

packages=()
command -v node >/dev/null || packages+=(nodejs)
command -v npm >/dev/null || packages+=(npm)
command -v curl >/dev/null || packages+=(curl)
if ! command -v nginx >/dev/null; then
  listeners="$(ss -H -ltn '( sport = :80 or sport = :443 )')"
  [[ -z "$listeners" ]] || { echo 'Another web server uses port 80/443. Inspect it before installing nginx.' >&2; exit 1; }
  packages+=(nginx)
fi
if ! command -v certbot >/dev/null; then
  packages+=(certbot python3-certbot-nginx)
elif ! certbot plugins 2>/dev/null | grep -q 'nginx'; then
  packages+=(python3-certbot-nginx)
fi
if ((${#packages[@]})); then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y "${packages[@]}"
fi
node -e 'if(Number(process.versions.node.split(".")[0])<18)throw Error("Existing Node is too old; update it separately after reviewing its other services.")'

id -u kalmar-arena >/dev/null 2>&1 || useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin kalmar-arena
install -d -o kalmar-arena -g kalmar-arena -m 0755 /opt/kalmar-arena
for file in index.mjs package.json package-lock.json; do
  install -o kalmar-arena -g kalmar-arena -m 0644 "$bundle_root/server/$file" "/opt/kalmar-arena/$file"
done
runuser -u kalmar-arena -- sh -c 'cd /opt/kalmar-arena && npm ci --omit=dev --ignore-scripts --cache /opt/kalmar-arena/.npm'
service=/etc/systemd/system/kalmar-arena.service
[[ ! -f "$service" ]] || cp -p "$service" "$service.backup-$(date +%Y%m%d-%H%M%S)"
sed "s|ExecStart=/usr/bin/node |ExecStart=$(command -v node) |" "$bundle_root/deploy/kalmar-arena.service" > "$service"
chmod 0644 "$service"
systemctl daemon-reload
systemctl enable kalmar-arena.service
systemctl restart kalmar-arena.service
for attempt in {1..20}; do
  if curl -fsS http://127.0.0.1:5221/health > /tmp/kalmar-arena-health.json; then break; fi
  sleep .25
done
node -e 'const h=JSON.parse(require("node:fs").readFileSync("/tmp/kalmar-arena-health.json"));if(!h.ok||h.mode!=="relay")throw Error("Relay health check failed");console.log(h)'

available=/etc/nginx/sites-available/kalmar-arena
enabled=/etc/nginx/sites-enabled/kalmar-arena
[[ -f "$available" ]] || install -m 0644 "$bundle_root/deploy/nginx-arena.conf" "$available"
if [[ -e "$enabled" || -L "$enabled" ]]; then
  [[ $(readlink -f "$enabled") == "$available" ]] || { echo 'Existing kalmar-arena vhost needs review.' >&2; exit 1; }
else
  ln -s "$available" "$enabled"
fi
nginx -t
systemctl reload nginx
if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi
if ! getent ahostsv4 arena.bjarby.com | awk '{print $1}' | grep -qx '70.34.197.55'; then
  echo 'Relay installed. DNS is not visible here yet; rerun this installer when arena.bjarby.com resolves to 70.34.197.55.' >&2
  exit 1
fi
certbot --nginx -d arena.bjarby.com --non-interactive --agree-tos --email anders@bjarby.com --no-eff-email --redirect --keep-until-expiring
nginx -t
systemctl reload nginx
echo 'Ready: wss://arena.bjarby.com/ws (room relay only)'
