# Расшифровать резервную копию канала. Windows PowerShell 5.1 / PowerShell 7.
#
# Ничего доустанавливать не нужно: расшифровка идёт средствами .NET, которые
# есть в самой Windows. Openssl, Gpg4win и 7-Zip не требуются — копия, которую
# нельзя открыть без лишних программ, это не копия, а ловушка.
#
#   .\TrueThrills-Restore.ps1 -Archive "C:\...\TrueThrills-2026-09-23.tar.gz.enc"
#
# Результат — обычный .tar.gz рядом с исходным файлом. Распаковать его умеет
# сам Windows (tar входит в систему с Windows 10 1803).
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$Archive,
 [string]$Output=''
)
$ErrorActionPreference='Stop'
$Archive=(Resolve-Path -LiteralPath $Archive).Path
if(-not $Output){ $Output = $Archive -replace '\.enc$','' }
if($Output -eq $Archive){ throw 'Ожидается файл .enc — этот уже расшифрован.' }

$Secure=Read-Host -AsSecureString 'Пароль от копии'
$Plain=[Runtime.InteropServices.Marshal]::PtrToStringAuto(
 [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure))

$In=[IO.File]::OpenRead($Archive)
try{
 # Формат openssl: 'Salted__' + 8 байт соли + шифротекст.
 $Header=New-Object byte[] 16
 if($In.Read($Header,0,16) -ne 16){ throw 'Файл короче заголовка: копия повреждена.' }
 if([Text.Encoding]::ASCII.GetString($Header,0,8) -ne 'Salted__'){
  throw 'Это не зашифрованная копия True Thrills (нет метки Salted__).' }
 $Salt=$Header[8..15]

 # Те же параметры, что и при создании: PBKDF2-SHA256, 200000 итераций,
 # 48 байт — 32 на ключ и 16 на вектор инициализации.
 $Kdf=New-Object Security.Cryptography.Rfc2898DeriveBytes(
  [Text.Encoding]::UTF8.GetBytes($Plain), [byte[]]$Salt, 200000,
  [Security.Cryptography.HashAlgorithmName]::SHA256)
 $Bytes=$Kdf.GetBytes(48)

 $Aes=[Security.Cryptography.Aes]::Create()
 $Aes.KeySize=256; $Aes.Mode='CBC'; $Aes.Padding='PKCS7'
 $Aes.Key=$Bytes[0..31]; $Aes.IV=$Bytes[32..47]

 $Out=[IO.File]::Create($Output)
 try{
  $Crypto=New-Object Security.Cryptography.CryptoStream($Out,$Aes.CreateDecryptor(),'Write')
  $In.CopyTo($Crypto)
  $Crypto.FlushFinalBlock()
  $Crypto.Dispose()
 } finally { $Out.Dispose() }
} catch {
 if(Test-Path -LiteralPath $Output){ Remove-Item -LiteralPath $Output -Force }
 if($_.Exception.InnerException -is [Security.Cryptography.CryptographicException] -or
    $_.Exception -is [Security.Cryptography.CryptographicException]){
  throw 'Не удалось расшифровать: скорее всего неверный пароль.' }
 throw
} finally {
 $In.Dispose()
 $Plain=$null
}

Write-Host "Расшифровано: $Output"
Write-Host "Распаковать: tar -xzf `"$Output`""
