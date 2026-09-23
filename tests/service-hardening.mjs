#!/usr/bin/env node
/**
 * Проверяет, что постоянно работающие сервисы не запускаются от root.
 *
 * Проверяются юниты, которые скрипты установки реально пишут на сервер, — то
 * есть содержимое scripts/vps-setup.sh и scripts/install-operations.sh. Это
 * не проверка живого VPS: сказать «сервис работает от truethrills» можно
 * только по `systemctl show`, и это отдельная работа руками.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const setup = read('scripts/vps-setup.sh'), ops = read('scripts/install-operations.sh');

/** Достаёт тело юнита из heredoc в скрипте. */
function unit(text, name) {
 const at = text.indexOf('/etc/systemd/system/' + name);
 assert.notEqual(at, -1, 'юнит ' + name + ' не создаётся');
 const body = text.slice(at, text.indexOf('\nUNIT', at) === -1 ? text.indexOf('\nEOF', at) : text.indexOf('\nUNIT', at));
 assert.ok(body.includes('[Service]'), 'у ' + name + ' не найдена секция [Service]');
 return body;
}

// Приложение принимает запросы из интернета, воркер запускает ffmpeg над
// присланными кусками звука, мониторинг ходит наружу. Ошибка в любом из них
// не должна давать доступ ко всей машине.
for (const name of ['truethrills.service', 'truethrills-live.service', 'truethrills-monitor.service']) {
 const text = ops;
 const body = unit(text, name);
 assert.match(body, /^User=truethrills$/m, name + ' запускается от root');
 assert.match(body, /^Group=truethrills$/m, name + ' без группы');
 assert.match(body, /^NoNewPrivileges=true$/m, name + ' может повышать права');
 assert.match(body, /^ProtectSystem=full$/m, name + ' видит систему на запись');
 assert.match(body, /^ProtectHome=true$/m, name + ' видит домашние каталоги');
}

// Бэкап останавливает и запускает сервисы, то есть вызывает systemctl. Он и
// должен оставаться от root — но осознанно, с объяснением рядом.
const backup = unit(ops, 'truethrills-backup.service');
assert.ok(!/^User=/m.test(backup), 'бэкапу нужен systemctl, он остаётся административной операцией от root');
assert.match(ops, /Остаётся от root осознанно/, 'исключение для бэкапа должно быть объяснено в скрипте, а не выглядеть забытым');

// Все юниты пишет один скрипт — тот, через который проходит каждое
// обновление. Иначе правка доезжает до новых серверов, а работающий остаётся
// со старым юнитом и по-прежнему работает от root.
assert.ok(!/cat > \/etc\/systemd\/system\//.test(setup), 'vps-setup.sh снова пишет юниты сам: до работающего сервера эта правка не доедет');
assert.match(setup, /bash "\$\{APP_DIR\}\/scripts\/install-operations\.sh"/, 'vps-setup.sh должен ставить сервисы через install-operations.sh');
assert.match(read('scripts/update-safe.sh'), /bash scripts\/install-operations\.sh/, 'обновление должно переписывать юниты, а не только код');

// Пользователь создаётся без оболочки и владеет только своим.
assert.match(ops, /useradd --system .*--shell \/usr\/sbin\/nologin/, 'пользователь сервиса должен создаваться системным и без оболочки');
assert.match(ops, /chown -R truethrills:truethrills \/opt\/truethrills/, 'каталог приложения должен принадлежать пользователю сервиса');
assert.match(ops, /chmod 700 \/opt\/truethrills\/data/, 'в каталоге данных лежит база с ключами push-подписок — он не должен быть открыт на чтение всем на машине');
for (const where of ['scripts/install-operations.sh', 'scripts/vps-setup.sh', 'scripts/update-safe.sh'])
 assert.match(read(where), /safe\.directory/, where + ': git от root в чужом каталоге откажется работать и обновление встанет');
// Блокировка воркера переезжает из общедоступного /run/lock в свой каталог,
// который systemd создаёт от имени сервиса.
const live = unit(ops, 'truethrills-live.service');
assert.match(live, /^RuntimeDirectory=truethrills-live$/m);
assert.ok(!/\/run\/lock\/truethrills-live/.test(live), 'файл блокировки не должен лежать в общедоступном /run/lock');

// Копию снимает root, а наличие копий проверяет мониторинг от пользователя
// сервиса: без доступа он доложит о пропаже бэкапов, которых нет. Но доступ
// этот — только на чтение. Прежний `chown -R truethrills` отдавал копии
// сервису целиком, и захваченный процесс приложения уносил вместе с данными
// возможность их вернуть.
const backupScript = read('scripts/backup-service.sh');
assert.match(backupScript, /chown -R root:truethrills \/var\/backups\/truethrills/,
 'копии должны принадлежать root, а сервису доставаться только по группе');
assert.match(backupScript, /chmod -R u=rwX,g=rX,o= \/var\/backups\/truethrills/,
 'группе нужен только доступ на чтение: запись в каталог позволяет удалять файлы');
assert.equal(/chown -R truethrills:truethrills \/var\/backups/.test(backupScript), false,
 'копии снова отданы сервису целиком');

// Код и административные скрипты принадлежат root. Раньше установка отдавала
// сервисному пользователю весь /opt/truethrills — вместе с
// scripts/backup-service.sh, который root запускает по таймеру в 04:00.
// Это был путь от захваченного процесса приложения к root.
const install = read('scripts/install-operations.sh');
assert.equal(/chown -R truethrills:truethrills \/opt\/truethrills\s*$/m.test(install), false,
 'весь каталог приложения снова отдан сервисному пользователю: это путь к root через обслуживание');
assert.match(install, /chown -R root:truethrills \/opt\/truethrills/,
 'код принадлежит root, но группой обязан быть сервис — иначе он не прочитает собственные файлы');

// Закрыть запись мало: нужно ОТКРЫТЬ чтение. 23 сентября приложение легло
// именно на этом. update-safe.sh работает под umask 077, файлы создаются
// «только владельцу», и после смены владельца на root сервис перестал
// читать свой же код: next start падал на tsconfig.json с EACCES, а
// нечитаемый node_modules/next Node показывал как «модуль не найден».
assert.match(install, /chmod -R u=rwX,go=rX \/opt\/truethrills/,
 'нужно явное право чтения: umask 077 иначе оставляет файлы закрытыми даже для чтения');
// Закрывать чтение кода от «посторонних» тут нечего: на машине один админский
// аккаунт, и у него есть sudo. Попытка это сделать сломала обслуживание —
// пользователь SSH тоже «посторонний», и `cd /opt/truethrills` переставал
// работать. Закрыты именно секреты: данные, .env и копии.
assert.equal(/chmod -R u=rwX,g=rX,o= \/opt\/truethrills/.test(install), false,
 'снова закрыто чтение для «посторонних»: это ломает вход по SSH и ничего не защищает');
assert.match(install, /chmod 700 \/opt\/truethrills\/data/, 'каталог данных обязан быть закрыт');
assert.match(install, /chmod 640 \/opt\/truethrills\/\.env/, '.env обязан быть закрыт от посторонних');

// И проверка тем же способом, каким читает сервис. Права, проверенные
// чтением текста скрипта, ничего не доказывают — это и подвело в прошлый раз.
for (const required of ['next.config.ts', 'tsconfig.json', 'package.json']) {
 assert.ok(install.includes(required),
  'установка должна убедиться, что сервис читает ' + required);
}
assert.match(install, /runuser -u truethrills -- test -r/,
 'читаемость нужно проверять от имени сервиса, а не от root');
assert.match(install, /runuser -u truethrills -- test -x \/opt\/truethrills\/node_modules\/next/,
 'установка должна убедиться, что сервису доступен next — иначе служба уходит в цикл перезапусков');
for (const writable of ['/opt/truethrills/data', '/opt/truethrills/.next/cache']) {
 assert.ok(install.includes('chown -R truethrills:truethrills ' + writable),
  'сервису нужен доступ на запись в ' + writable);
}
assert.match(install, /chown root:truethrills \/opt\/truethrills\/\.env/,
 '.env читает сервис, но менять его он не должен');

console.log('PASS: приложение, воркер эфира и мониторинг запускаются от системного пользователя без оболочки; от root остаётся только обслуживание; код и копии сервису не принадлежат, но читаются им — и это проверяется от его имени');
