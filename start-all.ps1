$ErrorActionPreference = 'Stop'

$backend = Start-Process powershell -ArgumentList '-NoExit','-File','D:\webDevelop\sharele\backend\scripts\start.ps1' -PassThru
$frontend = Start-Process powershell -ArgumentList '-NoExit','-File','D:\webDevelop\sharele\frontend\scripts\start.ps1' -PassThru

Write-Host "Backend PID: $($backend.Id)"
Write-Host "Frontend PID: $($frontend.Id)"
Write-Host "Frontend URL: http://localhost:5173"
Write-Host "Backend URL:  http://localhost:3000"
