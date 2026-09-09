# TURN: подготовка на существующем Oracle VPS

Конфигурация для проверки администратором, не подтверждённая установка. Используется существующий VPS; новый платный сервер не нужен. Реальный трафик и лимиты Oracle нужно контролировать отдельно.

Установить пакет `coturn` из Ubuntu. Перед изменением сохранить существующий `/etc/turnserver.conf`. Время сервера должно синхронизироваться. Сгенерировать случайный секрет локально на VPS (`openssl rand -hex 32`); не публиковать его.

Пример `/etc/turnserver.conf` (заменить PUBLIC_IPV4, PRIVATE_IPV4 и SECRET; не вставлять эти placeholders в рабочую конфигурацию):

```ini
listening-port=3478
listening-ip=PRIVATE_IPV4
relay-ip=PRIVATE_IPV4
external-ip=PUBLIC_IPV4/PRIVATE_IPV4
min-port=49160
max-port=49200
fingerprint
use-auth-secret
static-auth-secret=SECRET
realm=truethrills.com
server-name=truethrills.com
stale-nonce=600
total-quota=32
user-quota=4
bps-capacity=1000000
max-bps=128000
no-cli
no-tls
no-dtls
no-multicast-peers
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=::1
denied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
denied-peer-ip=fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff
```

Это начальный ограниченный профиль для пилота: IPv4, UDP/TCP 3478, relay UDP 49160–49200, без TLS. Он не обходит сети, где разрешён только TLS 443. HTTPS приложения продолжает обслуживать nginx на 443. Не занимать этот порт coturn без отдельного сетевого проекта. `bps-capacity`/`max-bps` заданы в байтах в секунду и не заменяют месячный лимит трафика.

Закрыть права конфигурации от посторонних и дать чтение пользователю службы coturn. Открыть 3478 TCP+UDP и 49160–49200 UDP одновременно в локальном firewall и Oracle Security List/NSG. Адрес `truethrills.com` должен указывать прямо на VPS для TURN; HTTP-прокси не переносит TURN автоматически.

В `/opt/truethrills/.env`:

```dotenv
TURN_URLS=turn:truethrills.com:3478?transport=udp,turn:truethrills.com:3478?transport=tcp
TURN_SECRET=SECRET
```

Перезапустить coturn и True Thrills вне эфира. Проверить ошибки journal. На активном эфире запрос `/api/ice` должен возвращать TURN-параметры с временным username и credential, без общего секрета. Принудительно проверить `iceTransportPolicy: relay` в тестовом клиенте и фактическую пару relay-кандидатов через WebRTC stats; затем провести эфир между двумя сетями.

Креденшлы действуют час. Они доступны анонимному слушателю во время эфира, поэтому лимиты на самом coturn обязательны. Случайный суффикс username разделяет allocations, но не идентифицирует человека и не защищает от выдачи множества анонимных credentials. Перед ростом аудитории добавить выдачу по сессии слушателя и ограничения частоты.

Основание параметров: [официальный пример coturn](https://github.com/coturn/coturn/blob/master/examples/etc/turnserver.conf). Применимость к установленной версии пакета проверить перед запуском.
