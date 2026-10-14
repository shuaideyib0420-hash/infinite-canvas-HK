param([string]$Model)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command npx.cmd -ErrorAction SilentlyContinue)) { throw 'Please install a supported Node.js LTS version with npm first.' }
if ([string]::IsNullOrWhiteSpace($Model)) { $Model = Read-Host 'Velumo text model ID (use a model available to your Key)' }
if ([string]::IsNullOrWhiteSpace($Model)) { throw 'Model ID is required.' }
$agentKey = Read-Host 'Your Velumo API Key (hidden input, used only for this process)' -AsSecureString
$profileRoot = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.velumo-canvas\codex'
foreach ($profilePath in @((Split-Path -Parent $profileRoot), $profileRoot, (Join-Path $profileRoot 'config.toml'))) {
    if ((Test-Path -LiteralPath $profilePath) -and ((Get-Item -LiteralPath $profilePath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'The Velumo profile must not be a symbolic link or junction.' }
}
New-Item -ItemType Directory -Path $profileRoot -Force | Out-Null
$profileSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$profileAcl = [Security.AccessControl.DirectorySecurity]::new()
$profileAcl.SetOwner($profileSid)
$profileAcl.SetAccessRuleProtection($true,$false)
foreach ($identity in @($profileSid.Value,'S-1-5-18','S-1-5-32-544')) { $profileAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($identity),'FullControl','ContainerInherit,ObjectInherit','None','Allow')) }
Set-Acl -LiteralPath $profileRoot -AclObject $profileAcl
$modelLiteral = ConvertTo-Json -InputObject $Model -Compress
$configuration = @('model_provider = "velumo"',('model = ' + $modelLiteral),'','[model_providers.velumo]','name = "Velumo"','base_url = "https://api.htvelumo.com/v1"','wire_api = "responses"','env_key = "VELUMO_API_KEY"','requires_openai_auth = false') -join [Environment]::NewLine
[IO.File]::WriteAllText((Join-Path $profileRoot 'config.toml'),$configuration,[Text.UTF8Encoding]::new($false))
$previousProfile = $env:CODEX_HOME
$previousKey = $env:VELUMO_API_KEY
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($agentKey)
try {
    $env:CODEX_HOME = $profileRoot
    $env:VELUMO_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    if ([string]::IsNullOrWhiteSpace($env:VELUMO_API_KEY)) { throw 'API Key is required.' }
    & npx.cmd -y '@basketikun/canvas-agent@0.6.0'
    if ($LASTEXITCODE -ne 0) { throw ('Canvas Agent exited with code ' + $LASTEXITCODE) }
} finally {
    $env:CODEX_HOME = $previousProfile
    $env:VELUMO_API_KEY = $previousKey
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    $agentKey.Dispose()
}
