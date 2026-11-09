# Builds the Pitwall Android companion (build/Pitwall.apk) straight from the Android SDK tools:
# no Gradle and no downloads. Needs the Android SDK (platform 34 + build-tools) and a JDK 17 in tools/jdk17.
param([switch]$Debug) # -Debug: inspectable from chrome://inspect, for troubleshooting only
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = Split-Path $here -Parent

$jdk = Join-Path $root 'tools\jdk17'
if (-not (Test-Path "$jdk\bin\javac.exe")) { throw "JDK 17 not found in $jdk" }
$env:JAVA_HOME = $jdk
$env:PATH = "$jdk\bin;$env:PATH"

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$androidJar = Join-Path $sdk 'platforms\android-34\android.jar'
if (-not (Test-Path $androidJar)) { throw "Android platform 34 not found in $sdk" }
$bt = Get-ChildItem (Join-Path $sdk 'build-tools') -Directory | Sort-Object { [version]$_.Name } | Select-Object -Last 1
$bt = $bt.FullName

$out = Join-Path $here 'out'
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force "$out\gen", "$out\classes", "$out\dex", "$here\res\drawable-nodpi" | Out-Null

# launcher icon from the desktop icon
Copy-Item (Join-Path $root 'build\icon.png') "$here\res\drawable-nodpi\icon.png" -Force

# The interface, bundled so the app works offline. Its hash (same files, same order as companion.js) lets the app
# notice when the computer has a newer version.
$www = "$out\assets\www"
New-Item -ItemType Directory -Force $www, "$www\app", "$www\vendor" | Out-Null
# the renderer's files (src\app, in name order) first, as in companion.js
# sorted by character code, as JavaScript sorts them (Sort-Object ignores hyphens: 13b-debrief would come before 13-live-race)
$names = [string[]]@(Get-ChildItem (Join-Path $root 'src\app') -Filter *.js | ForEach-Object Name); [Array]::Sort($names, [StringComparer]::Ordinal)
$appFiles = @($names | ForEach-Object { "app\$_" })
$bundle = $appFiles + @('data.js', 'reference.js', 'history.js', 'assets.js', 'pool.js', 'pictures.js', 'styles.css', 'remote.js', 'world.js', 'vendor\d3-array.min.js', 'vendor\d3-geo.min.js', 'vendor\topojson-client.min.js', 'index.html')
$ms = New-Object IO.MemoryStream
foreach ($f in $bundle) { $b = [IO.File]::ReadAllBytes((Join-Path $root "src\$f")); $ms.Write($b, 0, $b.Length) }
$sha = [Security.Cryptography.SHA256]::Create()
$build = (($sha.ComputeHash($ms.ToArray()) | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0, 16)
foreach ($f in $bundle) { if ($f -ne 'index.html') { Copy-Item (Join-Path $root "src\$f") "$www\$f" } }
$index = [IO.File]::ReadAllText((Join-Path $root 'src\index.html'))
$index = $index.Replace('<head>', "<head>`n  <meta name=`"pitwall-companion`" content=`"app`">`n  <meta name=`"pitwall-build`" content=`"$build`">")
[IO.File]::WriteAllText("$www\index.html", $index, (New-Object Text.UTF8Encoding $false))
Copy-Item "$here\assets\connect.html" "$www\connect.html"

# Each build gets a higher version number, so Android installs it over the previous one.
$versionCode = [int][math]::Floor(((Get-Date).ToUniversalTime() - [datetime]'2025-01-01').TotalMinutes)
$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$versionName = "$($pkg.version) ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))"

function Run($exe, [string[]]$argv) {
  & $exe @argv
  if ($LASTEXITCODE -ne 0) { throw "$([IO.Path]::GetFileName($exe)) failed ($LASTEXITCODE)" }
}

Write-Host 'Resources...'
Run "$bt\aapt2.exe" @('compile', '--dir', "$here\res", '-o', "$out\res.zip")
$linkArgs = @('link', '-o', "$out\base.apk", '-I', $androidJar, '--manifest', "$here\AndroidManifest.xml",
  '--java', "$out\gen", '--min-sdk-version', '26', '--target-sdk-version', '34',
  '--version-code', "$versionCode", '--version-name', $versionName, "$out\res.zip")
if ($Debug) { $linkArgs += '--debug-mode' }
Run "$bt\aapt2.exe" $linkArgs

Write-Host 'Compiling...'
$sources = @(Get-ChildItem "$here\src", "$out\gen" -Recurse -Filter *.java | ForEach-Object FullName)
Run "$jdk\bin\javac.exe" (@('-nowarn', '-Xlint:-options', '-source', '8', '-target', '8', '-encoding', 'UTF-8', '-bootclasspath', "$androidJar;$bt\core-lambda-stubs.jar", '-d', "$out\classes") + $sources)
$classes = @(Get-ChildItem "$out\classes" -Recurse -Filter *.class | ForEach-Object FullName)
Run "$bt\d8.bat" (@('--release', '--min-api', '26', '--lib', $androidJar, '--output', "$out\dex") + $classes)

Write-Host 'Packaging...'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
Copy-Item "$out\base.apk" "$out\unsigned.apk"
$zip = [IO.Compression.ZipFile]::Open("$out\unsigned.apk", 'Update')
[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$out\dex\classes.dex", 'classes.dex')
# assets go in here rather than through aapt2 -A, which writes Windows backslashes into nested entry names
$wwwFull = (Get-Item $www).FullName.TrimEnd('\')
foreach ($f in Get-ChildItem $www -File -Recurse) { $rel = $f.FullName.Substring($wwwFull.Length + 1).Replace('\', '/'); [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, "assets/www/$rel") }
$zip.Dispose()
Run "$bt\zipalign.exe" @('-f', '-p', '4', "$out\unsigned.apk", "$out\aligned.apk")

# A local signing key, kept so each new build installs over the last one.
$ks = Join-Path $here 'pitwall-companion.keystore'
if (-not (Test-Path $ks)) {
  Run "$jdk\bin\keytool.exe" @('-genkeypair', '-keystore', $ks, '-alias', 'pitwall', '-keyalg', 'RSA', '-keysize', '2048',
    '-validity', '10000', '-storepass', 'pitwall-local', '-keypass', 'pitwall-local', '-dname', 'CN=Pitwall Companion')
}
$apk = Join-Path $root 'build\Pitwall.apk'
Run "$bt\apksigner.bat" @('sign', '--ks', $ks, '--ks-pass', 'pass:pitwall-local', '--key-pass', 'pass:pitwall-local', '--out', $apk, "$out\aligned.apk")
Run "$bt\apksigner.bat" @('verify', $apk)
Write-Host "Built $apk ($([math]::Round((Get-Item $apk).Length / 1KB)) KB), version $versionName, interface $build"
