<#
  Обновление сервера одним кликом — с понятным ответом в конце.

  Прежний .cmd просто запускал обслуживание и говорил «нажмите любую клавишу».
  Владелец нажимал, окно закрывалось вместе со всем, что там было напечатано, и
  ответа на единственный важный вопрос — доехало или нет — не оставалось.

  Здесь ход работы идёт на экран и одновременно в журнал на рабочем столе, а в
  конце печатается один вывод: обновилось или нет, и каким кодом. Журнал
  остаётся на диске, поэтому его можно открыть и через час.

  Вывод ищется по строке «Updated successfully» — она латиницей нарочно:
  русские буквы в журнале старый PowerShell перекодирует по-своему, и поиск по
  ним становится ненадёжным.
#>
param(
 [string]$KeyPath = 'D:\True Thrills\Private SSH - Key\ssh-key-2026-09-06.key'
)
$ErrorActionPreference = 'Continue'
# Сервер отвечает по-русски и в UTF-8, а консоль Windows читает вывод чужих
# программ в кодировке системы — cp866. Русские строки от обновления
# превращались в набор знаков, и предупреждение про осиротевшие обложки
# владелец прочитать не мог. Переключаем только вывод и только в этом окне:
# на саму систему и на другие окна это не влияет.
try{ [Console]::OutputEncoding = [Text.Encoding]::UTF8 }catch{}
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$log  = Join-Path ([Environment]::GetFolderPath('Desktop')) 'TrueThrills-obnovlenie.txt'

Write-Host ''
Write-Host '  Обновляю True Thrills. Это занимает пару минут.' -ForegroundColor Cyan
Write-Host ''

& (Join-Path $here 'TrueThrills-Server.ps1') -Action Update -KeyPath $KeyPath 2>&1 |
 Tee-Object -FilePath $log

$done = Select-String -Path $log -Pattern 'Updated successfully' -SimpleMatch |
 Select-Object -Last 1

Write-Host ''
Write-Host '  ----------------------------------------------------------------'
if ($done) {
 $code = ''
 if ($done.Line -match 'Updated successfully to ([0-9a-f]{7,40})') { $code = $Matches[1].Substring(0,7) }
 Write-Host ("  ОБНОВЛЕНО. Код сборки: " + $code) -ForegroundColor Green
 Write-Host '  Теперь на телефоне: Настройки - Приложения - True Thrills -'
 Write-Host '  Память - Очистить кэш. «Очистить данные» не трогать.'
} else {
 Write-Host '  НЕ ОБНОВИЛОСЬ.' -ForegroundColor Red
 Write-Host '  Строки «Updated successfully» в отчёте нет — обновление не дошло.'
 Write-Host '  Пришли журнал целиком, он лежит на рабочем столе.'
}
Write-Host ('  Журнал: ' + $log)
Write-Host '  ----------------------------------------------------------------'
Write-Host ''
Read-Host '  Нажми Enter, чтобы закрыть окно'
