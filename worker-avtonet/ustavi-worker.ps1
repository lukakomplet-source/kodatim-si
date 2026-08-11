# Stops every running SBN Auto worker.
#
# A worker can outlive the window that started it: closing a terminal, or ending
# a session that launched one in the background, leaves the node process holding
# port 8080. The next start then reports "already running" with no obvious way to
# clear it. This is that way.
#
# In its own file rather than inline in the .bat on purpose — quoting a script
# like this through cmd.exe is fragile enough that it broke while being written.
#
# Deliberately narrow: matches only node processes running
# worker-avtonet\src\index.ts, so the Next.js dev server and every other node
# process on the machine are untouched.
#
#   powershell -ExecutionPolicy Bypass -File .\ustavi-worker.ps1
#   powershell -ExecutionPolicy Bypass -File .\ustavi-worker.ps1 -SamoPokazi

param([switch]$SamoPokazi)

$vzorec = '*worker-avtonet*index.ts*'

$workerji = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like $vzorec }

if (-not $workerji) {
    Write-Host '  Noben worker ne tece.'
} else {
    foreach ($p in $workerji) {
        if ($SamoPokazi) {
            Write-Host "  (samo prikaz) ustavil bi PID $($p.ProcessId)"
        } else {
            Write-Host "  Ustavljam PID $($p.ProcessId)"
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
}

# Proof that the dev server is not in the firing line.
$dev = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like '*next*start-server*' }
if ($dev) {
    foreach ($d in $dev) { Write-Host "  Dev streznik PID $($d.ProcessId) ostaja nedotaknjen." }
}

if (-not $SamoPokazi) {
    Start-Sleep -Seconds 2
    $vrata = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
    if ($vrata) {
        Write-Host '  OPOZORILO: port 8080 je se zaseden.'
    } else {
        Write-Host '  Port 8080 je prost.'
    }
}
