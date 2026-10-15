#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run with sudo.' >&2; exit 1; }
cd /opt/truethrills
command -v ffmpeg >/dev/null || { echo 'Install ffmpeg first: sudo apt-get install ffmpeg' >&2; exit 1; }
command -v ffprobe >/dev/null

# Постоянно работающие процессы не должны быть root. Приложение принимает
# запросы из интернета, воркер запускает ffmpeg над присланными кусками звука;
# ошибка в любом из них не должна давать доступ ко всей машине. Отдельный
# системный пользователь без оболочки владеет только тем, что ему нужно:
# данными и каталогом бэкапов.
#
# Обслуживание остаётся отдельно и остаётся от root: truethrills-backup.service
# останавливает и запускает сервисы, а это systemctl.
id -u truethrills >/dev/null 2>&1 || useradd --system --home-dir /opt/truethrills --shell /usr/sbin/nologin truethrills
install -d -m 750 -o root -g truethrills /var/backups/truethrills
# Код принадлежит root, а не сервису.
#
# Раньше здесь стоял `chown -R truethrills /opt/truethrills` — «проще и
# надёжнее». Это давало сервисному пользователю право переписать
# server/backup-service.sh, который root запускает по таймеру в 04:00:
# захваченный процесс приложения получал root на следующем обслуживании.
# Сервис пишет только туда, куда ему действительно нужно.
#
# Владелец root, ГРУППА — сервисная, и группе даётся чтение. Без этой строки
# приложение легло 23 сентября: update-safe.sh работает под `umask 077`, все
# файлы создаются «только владельцу», и после смены владельца на root сервис
# перестал читать собственный код — next start падал на tsconfig.json с
# EACCES. Запись закрыли, а заодно нечаянно закрыли и чтение.
chown -R root:truethrills /opt/truethrills
# Чтение открыто всем, запись — только root. Сначала здесь стояло `o=`, и
# это сломало обслуживание: пользователь ubuntu, под которым заходят по SSH,
# для этого каталога тоже «посторонний», и даже `cd` переставал работать.
# Защиты то ограничение не давало: на машине один админский аккаунт, и у
# него есть sudo. Закрывать нужно было запись сервисом в код, который
# запускает root, а не чтение. Секреты закрыты отдельно и ниже: данные 700,
# .env 640, копии 750.
chmod -R u=rwX,go=rX /opt/truethrills
# Данные: база, звук, обложки, рабочие файлы эфира.
install -d -m 700 -o truethrills -g truethrills /opt/truethrills/data
chown -R truethrills:truethrills /opt/truethrills/data
# Next пишет кэш оптимизированных картинок во время работы.
install -d -m 750 -o truethrills -g truethrills /opt/truethrills/.next/cache
chown -R truethrills:truethrills /opt/truethrills/.next/cache
# .env читает сервис, но менять его он не должен.
chown root:truethrills /opt/truethrills/.env 2>/dev/null || true
chmod 640 /opt/truethrills/.env 2>/dev/null || true
# Проверяем тем же способом, каким читает сервис: если он не может открыть
# свой конфиг, лучше упасть здесь, при обслуживании, чем в цикле перезапусков.
for required in /opt/truethrills/next.config.ts /opt/truethrills/tsconfig.json /opt/truethrills/package.json; do
 runuser -u truethrills -- test -r "$required" || { echo "Сервис не может прочитать $required — проверь права." >&2; exit 1; }
done
runuser -u truethrills -- test -x /opt/truethrills/node_modules/next/dist/bin/next \
 || { echo 'Сервису недоступен node_modules/next — установка зависимостей не завершилась.' >&2; exit 1; }
# База лежит здесь же, а в ней приватные ключи push-подписок: читать её
# посторонним на машине незачем. Каталог создаётся приложением с правами по
# умолчанию, поэтому закрываем его явно и на каждом обновлении.
chmod 700 /opt/truethrills/data 2>/dev/null || true
# Копии сервис читает (мониторинг смотрит их возраст), но переписать или
# стереть не может: право на это даёт запись в каталог, а её у группы нет.
# Иначе захваченный процесс уносит вместе с данными и возможность их вернуть.
chown -R root:truethrills /var/backups/truethrills 2>/dev/null || true
chmod 750 /var/backups/truethrills 2>/dev/null || true
# Иначе git от root ругается на «dubious ownership» при следующем обновлении.
git config --global --add safe.directory /opt/truethrills 2>/dev/null || true
# Юниты пишутся здесь, а не в vps-setup.sh, потому что через этот скрипт
# проходит каждое обновление (его вызывает update-safe.sh). Иначе правка юнита
# доезжала бы только до новых серверов, а работающий остался бы со старым — и
# приложение так и работало бы от root.
cat > /etc/systemd/system/truethrills.service <<UNIT
[Unit]
Description=True Thrills
After=network.target

[Service]
Type=simple
User=truethrills
Group=truethrills
WorkingDirectory=/opt/truethrills
EnvironmentFile=/opt/truethrills/.env
ExecStart=$(command -v node) /opt/truethrills/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=5
# next start не перехватывает SIGTERM и выходит кодом 143. Для systemd это
# неудача, и после обычной остановки — а обновление останавливает службу
# каждый раз — юнит оставался в состоянии failed. Состояние ложное: служба
# была остановлена намеренно и штатно. Но выглядит оно как поломка и уводит
# разбор в сторону, что однажды уже случилось.
SuccessExitStatus=143
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/truethrills-live.service <<'UNIT'
[Unit]
Description=True Thrills live delivery and recording
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=truethrills
Group=truethrills
WorkingDirectory=/opt/truethrills
RuntimeDirectory=truethrills-live
ExecStart=/usr/bin/flock -n /run/truethrills-live/worker.lock /usr/bin/env node --env-file=.env server/live-worker.mjs
Restart=on-failure
RestartSec=5
TimeoutStopSec=140
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
[Install]
WantedBy=multi-user.target
UNIT
# Остаётся от root осознанно: снимает копию с остановленными сервисами, то есть
# вызывает systemctl. Это административная операция, а не рабочий процесс.
cat > /etc/systemd/system/truethrills-backup.service <<'UNIT'
[Unit]
Description=True Thrills verified backup
[Service]
Type=oneshot
WorkingDirectory=/opt/truethrills
ExecStart=/bin/bash /opt/truethrills/server/backup-service.sh
UNIT
cat > /etc/systemd/system/truethrills-backup.timer <<'UNIT'
[Unit]
Description=Daily True Thrills backup
[Timer]
OnCalendar=*-*-* 04:00:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
cat > /etc/systemd/system/truethrills-monitor.service <<'UNIT'
[Unit]
Description=True Thrills health checks
[Service]
Type=oneshot
User=truethrills
Group=truethrills
WorkingDirectory=/opt/truethrills
ExecStart=/usr/bin/env node --env-file=.env server/monitor.mjs
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
UNIT
cat > /etc/systemd/system/truethrills-monitor.timer <<'UNIT'
[Unit]
Description=True Thrills health checks every five minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable truethrills.service
systemctl enable --now truethrills-live.service truethrills-backup.timer truethrills-monitor.timer

# Предел тела запроса в nginx — под аудио до 300 МБ (lib/audio-limits.ts),
# то есть выпуск на полтора–два часа при 320 кбит/с. Конфигурацию с доменом и
# HTTPS не переписываем: меняется только эта строка, и только если там меньше.
# Если nginx после правки не принимает конфигурацию — возвращаем как было.
nginx_conf=/etc/nginx/sites-available/truethrills
if [ -f "$nginx_conf" ] && command -v nginx >/dev/null; then
 if grep -Eq 'client_max_body_size[[:space:]]+([0-9]|[0-9][0-9]|[12][0-9][0-9]|30[0-9]|31[0-9])M;' "$nginx_conf"; then
  cp -p "$nginx_conf" "$nginx_conf.before-320m"
  sed -E -i 's/client_max_body_size[[:space:]]+[0-9]+M;/client_max_body_size 320M;/' "$nginx_conf"
  if nginx -t 2>/dev/null; then
   systemctl reload nginx
   echo 'nginx: предел загрузки — 320M'
  else
   cp -p "$nginx_conf.before-320m" "$nginx_conf"
   echo 'nginx не принял новый предел — оставлен прежний' >&2
  fi
 fi
fi

# ---------------------------------------------------------------------------
# Защита сервера (15 октября, «хорошая защита… чтоб было не так просто
# взломать»). Каждый шаг проверяется и при сбое откатывается, а обновление
# идёт дальше: защита не должна ронять сайт.
# ---------------------------------------------------------------------------
harden_warn(){ echo "Защита: $1 — пропущено" >&2; }

# 1. nginx: лимиты на один IP-адрес. Обычная страница — десятки запросов
#    разом, поэтому запас (200) большой; держать 30 запросов в секунду
#    непрерывно и 60 соединений сразу один человек не может — это робот,
#    выкачивающий выпуски, или атака. Лишнее получает 429. Версия nginx в
#    ответах скрыта. Файл в conf.d действует на все сайты и не трогает
#    конфигурацию с доменом и HTTPS, которую правил certbot.
harden_nginx(){
 command -v nginx >/dev/null || return 0
 local f=/etc/nginx/conf.d/truethrills-limits.conf tokens='server_tokens off;'
 grep -Eqs '^[[:space:]]*server_tokens' /etc/nginx/nginx.conf && tokens='# server_tokens уже задан в nginx.conf'
 cat > "$f" <<NGINX
# True Thrills: лимиты на один IP (server/install-operations.sh).
$tokens
limit_req_zone \$binary_remote_addr zone=tt_req:10m rate=30r/s;
limit_conn_zone \$binary_remote_addr zone=tt_conn:10m;
limit_req zone=tt_req burst=200 nodelay;
limit_conn tt_conn 60;
limit_req_status 429;
limit_conn_status 429;
NGINX
 if nginx -t 2>/dev/null; then systemctl reload nginx; echo 'Защита: nginx — лимиты на IP включены, версия скрыта'
 else rm -f "$f"; harden_warn 'nginx не принял лимиты, файл убран'; fi
}

# 2. Автоматические обновления безопасности Ubuntu: дыры в системе
#    закрываются сами, без участия владельца. Перезагрузок сами не делают.
harden_updates(){
 command -v apt-get >/dev/null || return 0
 dpkg -s unattended-upgrades >/dev/null 2>&1 || DEBIAN_FRONTEND=noninteractive timeout 300 apt-get install -y unattended-upgrades >/dev/null || { harden_warn 'не установились автообновления'; return 0; }
 printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades
 echo 'Защита: автоматические обновления безопасности включены'
}

# 3. fail2ban: адрес, который подбирает вход по SSH или долбит сайт сверх
#    лимита, блокируется на час.
harden_fail2ban(){
 command -v apt-get >/dev/null || return 0
 dpkg -s fail2ban >/dev/null 2>&1 || DEBIAN_FRONTEND=noninteractive timeout 300 apt-get install -y fail2ban >/dev/null || { harden_warn 'не установился fail2ban'; return 0; }
 cat > /etc/fail2ban/jail.d/truethrills.local <<'JAIL'
[sshd]
enabled = true
maxretry = 5
bantime = 1h

[nginx-limit-req]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 30
findtime = 1m
bantime = 1h
JAIL
 systemctl enable --now fail2ban >/dev/null 2>&1 && systemctl restart fail2ban && echo 'Защита: fail2ban следит за SSH и лимитами сайта' || harden_warn 'fail2ban не запустился'
}

# 4. SSH: вход только по ключу, без пароля и без root. Ставится, только если
#    у кого-то на сервере уже есть ключ в authorized_keys — иначе владелец
#    остался бы снаружи. Имя 01-… — чтобы файл читался раньше
#    50-cloud-init.conf: в sshd побеждает первое значение.
harden_ssh(){
 command -v sshd >/dev/null || return 0
 grep -qsE '^(ssh-|ecdsa-|sk-)' /home/*/.ssh/authorized_keys || { harden_warn 'SSH: ни у кого нет ключа, вход по паролю не трогаем'; return 0; }
 local f=/etc/ssh/sshd_config.d/01-truethrills.conf
 [ -d /etc/ssh/sshd_config.d ] || return 0
 printf '# True Thrills: вход только по ключу (server/install-operations.sh).\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\nMaxAuthTries 4\n' > "$f"
 if sshd -t 2>/dev/null; then systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true; echo 'Защита: SSH — только по ключу, без root'
 else rm -f "$f"; harden_warn 'sshd не принял настройку, файл убран'; fi
}

# 5. Ключ Firebase на сервере читает только сервис, менять не может никто, кроме root.
harden_keys(){
 local key; key=$(grep -E '^FIREBASE_SERVICE_ACCOUNT_FILE=' /opt/truethrills/.env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"'')
 [ -n "$key" ] || return 0
 case "$key" in /*) ;; *) key=/opt/truethrills/$key ;; esac
 [ -f "$key" ] || return 0
 chown root:truethrills "$key" && chmod 640 "$key" && echo 'Защита: ключ Firebase — 640, root:truethrills'
}

harden_nginx || harden_warn 'nginx'
harden_updates || harden_warn 'автообновления'
harden_fail2ban || harden_warn 'fail2ban'
harden_ssh || harden_warn 'SSH'
harden_keys || harden_warn 'ключ Firebase'
