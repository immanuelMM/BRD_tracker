# Enable Mixed Mode Authentication on SQL Server Express
# and create a brd_app SQL login

$instance = "IMMAN\SQLEXPRESS"

# Find the registry key for this SQL Server instance
$regRoot = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server"
$instances = Get-ItemProperty "$regRoot\Instance Names\SQL" -ErrorAction SilentlyContinue
$mssqlKey = $instances.SQLEXPRESS

if (-not $mssqlKey) {
    Write-Error "Could not find SQLEXPRESS instance in registry"
    exit 1
}

$loginModePath = "$regRoot\$mssqlKey\MSSQLServer"
Write-Host "Registry path: $loginModePath"

$currentMode = (Get-ItemProperty $loginModePath).LoginMode
Write-Host "Current LoginMode: $currentMode (1=Windows only, 2=Mixed)"

if ($currentMode -ne 2) {
    Write-Host "Enabling Mixed Mode Authentication..."
    Set-ItemProperty -Path $loginModePath -Name "LoginMode" -Value 2
    Write-Host "Restarting SQL Server service..."
    Restart-Service -Name "MSSQL`$SQLEXPRESS" -Force
    Start-Sleep -Seconds 5
    Write-Host "SQL Server restarted."
} else {
    Write-Host "Mixed Mode already enabled."
}

# Create SQL login via sqlcmd
Write-Host "Creating SQL login 'brd_app'..."
$sql = @"
IF NOT EXISTS (SELECT name FROM sys.server_principals WHERE name = 'brd_app')
BEGIN
    CREATE LOGIN brd_app WITH PASSWORD = 'BrdApp2025!', CHECK_POLICY = OFF;
    PRINT 'Login created.';
END
ELSE
    PRINT 'Login already exists.';

USE brd_tracker;
IF NOT EXISTS (SELECT name FROM sys.database_principals WHERE name = 'brd_app')
BEGIN
    CREATE USER brd_app FOR LOGIN brd_app;
    ALTER ROLE db_owner ADD MEMBER brd_app;
    PRINT 'User created and added to db_owner.';
END
ELSE
    PRINT 'User already exists.';
"@

$sql | sqlcmd -S $instance -E
Write-Host "Done. Update your .env: DB_TRUSTED=false, DB_USER=brd_app, DB_PASSWORD=BrdApp2025!"
