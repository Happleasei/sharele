$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

pm2 start ecosystem.config.cjs
pm2 save
pm2 status sharele-backend
