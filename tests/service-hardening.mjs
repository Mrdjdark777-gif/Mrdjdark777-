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
// сервиса: без передачи владения он доложит о пропаже бэкапов, которых нет.
assert.match(read('scripts/backup-service.sh'), /chown -R truethrills:truethrills \/var\/backups\/truethrills/);

console.log('PASS: приложение, воркер эфира и мониторинг запускаются от системного пользователя без оболочки; от root остаётся только обслуживание, и это объяснено');
