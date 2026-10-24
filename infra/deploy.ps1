<#
.SYNOPSIS
  Provisions DJ Flow Lab on Azure (resource group + Static Web App) and, optionally,
  stores the deployment token as the GitHub Actions secret used by .github/workflows/deploy.yml.

.EXAMPLE
  ./infra/deploy.ps1                       # provision with defaults
  ./infra/deploy.ps1 -SetGitHubSecret      # provision and set the repo secret with the GitHub CLI

.NOTES
  Requires the Azure CLI (az login) and, for -SetGitHubSecret, the GitHub CLI (gh auth login).
  Safe to re-run: the deployment is incremental.
#>
param(
  [ValidateSet('westeurope', 'eastus2', 'centralus', 'westus2', 'eastasia')]
  [string]$Location = 'westeurope',
  [string]$ResourceGroup = 'rg-dj-flow-lab',
  [string]$AppName = 'dj-flow-lab',
  [ValidateSet('Free', 'Standard')]
  [string]$Sku = 'Free',
  [string]$Repo = 'andreykukalev/dj-flow-lab',
  [switch]$SetGitHubSecret
)

$ErrorActionPreference = 'Stop'
$template = Join-Path $PSScriptRoot 'main.bicep'

az account show --query "{subscription:name, id:id}" -o table
if ($LASTEXITCODE -ne 0) { throw 'Not signed in to Azure. Run: az login' }

Write-Host "Deploying $AppName ($Sku) to $ResourceGroup in $Location..."
az deployment sub create `
  --name 'dj-flow-lab' `
  --location $Location `
  --template-file $template `
  --parameters location=$Location resourceGroupName=$ResourceGroup appName=$AppName skuName=$Sku `
  --query 'properties.outputs.url.value' -o tsv
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed.' }

if ($SetGitHubSecret) {
  $token = az staticwebapp secrets list --name $AppName --resource-group $ResourceGroup --query 'properties.apiKey' -o tsv
  if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Could not read the deployment token.' }
  $token | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --repo $Repo
  if ($LASTEXITCODE -ne 0) { throw 'Could not set the GitHub secret. Run: gh auth login' }
  Write-Host "Secret AZURE_STATIC_WEB_APPS_API_TOKEN set on $Repo."
}
