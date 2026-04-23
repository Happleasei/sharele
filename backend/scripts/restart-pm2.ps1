$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

pm2 restart sharele-backend
pm2 status sharele-backend
