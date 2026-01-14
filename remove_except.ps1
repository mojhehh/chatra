[CmdletBinding(SupportsShouldProcess)]
param(
    [switch]$DryRun,
    [switch]$Push,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# Verify we're in a git repo
try {
    $null = git status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error 'Not a git repository. Please run this from within a git repo.'
        exit 1
    }
} catch {
    Write-Error 'Git is not available or this is not a git repository.'
    exit 1
}

Write-Host 'Starting removal of tracked files except index.html, script.js, style.css' -ForegroundColor Cyan
$keep = @('index.html','script.js','style.css')
$files = git ls-files

# Preview mode
if ($DryRun -or $WhatIfPreference) {
    Write-Host "`n=== DRY RUN MODE - No changes will be made ===" -ForegroundColor Yellow
    foreach ($f in $files) {
        if ($keep -contains $f) { 
            Write-Host "Would keep: $f" -ForegroundColor Green
        } else {
            Write-Host "Would remove: $f" -ForegroundColor Red
        }
    }
    Write-Host "`n=== End of dry run ===" -ForegroundColor Yellow
    exit 0
}

# Confirmation prompt (unless -Force is specified)
if (-not $Force) {
    Write-Host "`nThis will permanently remove tracked files from git." -ForegroundColor Yellow
    Write-Host "Files to keep: $($keep -join ', ')" -ForegroundColor Green
    $filesToRemove = $files | Where-Object { $keep -notcontains $_ }
    Write-Host "Files to remove: $($filesToRemove.Count)" -ForegroundColor Red
    
    $confirmation = Read-Host "`nType 'yes' to proceed with deletion"
    if ($confirmation -ne 'yes') {
        Write-Host 'Operation cancelled by user.' -ForegroundColor Yellow
        exit 0
    }
}

# Create safety backup branch
$backupBranch = "pre-delete-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
try {
    Write-Host "`nCreating safety backup branch: $backupBranch" -ForegroundColor Cyan
    git branch $backupBranch
    Write-Host "Backup branch created successfully." -ForegroundColor Green
} catch {
    Write-Host "Warning: Could not create backup branch: $_" -ForegroundColor Yellow
}

# Check for uncommitted changes before proceeding
$uncommittedStatus = git status --porcelain 2>&1
if ($uncommittedStatus) {
    Write-Host "`n=== WARNING: Uncommitted changes detected ===" -ForegroundColor Red
    Write-Host "The following files have uncommitted changes:" -ForegroundColor Yellow
    Write-Host $uncommittedStatus -ForegroundColor Yellow
    Write-Host "`nProceeding may result in loss of uncommitted work." -ForegroundColor Red
    
    if (-not $Force) {
        $proceed = Read-Host "`nType 'yes' to proceed despite uncommitted changes (or anything else to abort)"
        if ($proceed -ne 'yes') {
            Write-Host 'Operation cancelled due to uncommitted changes.' -ForegroundColor Yellow
            exit 0
        }
    } else {
        Write-Host "-Force specified, proceeding despite uncommitted changes..." -ForegroundColor Yellow
    }
}

# Perform deletions
foreach ($f in $files) {
    if ($keep -contains $f) { Write-Host "Keeping: $f" -ForegroundColor Green; continue }
    Write-Host "Removing: $f" -ForegroundColor Red
    git rm --ignore-unmatch -- "$f"
}

# Commit deletions (if any)
try {
    git commit -m 'Remove all tracked files except main three'
    Write-Host 'Changes committed.' -ForegroundColor Green
} catch {
    Write-Host 'Nothing to commit' -ForegroundColor Yellow
}

# Push only if explicitly requested
if ($Push) {
    Write-Host 'Pushing to origin main...' -ForegroundColor Cyan
    git push origin main
    Write-Host 'Pushed successfully.' -ForegroundColor Green
} else {
    Write-Host "`nChanges committed locally. Use -Push flag to push to remote." -ForegroundColor Yellow
}

Write-Host 'Done' -ForegroundColor Green