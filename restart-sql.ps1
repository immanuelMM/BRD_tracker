$svc = "MSSQL" + "$" + "SQLEXPRESS"
Restart-Service -Name $svc -Force
Write-Host "Restarted."
