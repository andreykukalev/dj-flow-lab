# Azure infrastructure

DJ Flow Lab is a static web app with no backend in the MVP, so the infrastructure is one resource group and one [Azure Static Web App](https://learn.microsoft.com/azure/static-web-apps/overview). Content is deployed by the `Deploy` GitHub Actions workflow with a deployment token, not by Azure's own GitHub integration.

| File                         | What it does                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `main.bicep`                 | Subscription-scope template: creates the resource group and calls the module. |
| `modules/staticWebApp.bicep` | The Static Web App (Free plan by default, preview environments enabled).      |
| `main.bicepparam`            | Default parameter values.                                                     |
| `deploy.ps1`                 | Runs the deployment and, optionally, sets the GitHub secret.                  |

Defaults: resource group `rg-dj-flow-lab`, Static Web App `dj-flow-lab`, region `westeurope`, plan `Free`. The Free plan allows 3 concurrent preview environments; older ones must close (closing the pull request does this automatically) before a new preview is created.

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) 2.53 or later (includes Bicep), signed in with `az login` to the subscription you want to use (`az account set --subscription <name or id>`).
- Optional: [GitHub CLI](https://cli.github.com/) signed in with `gh auth login`, to set the repository secret from the command line.

## Provision

PowerShell (Windows):

```powershell
./infra/deploy.ps1 -SetGitHubSecret
```

Or step by step, in any shell:

```sh
# 1. Create the resource group and the Static Web App (prints the app URL)
az deployment sub create --name dj-flow-lab --location westeurope \
  --template-file infra/main.bicep --parameters infra/main.bicepparam \
  --query properties.outputs.url.value -o tsv

# 2. Read the deployment token
az staticwebapp secrets list --name dj-flow-lab --resource-group rg-dj-flow-lab \
  --query properties.apiKey -o tsv

# 3. Store it as the repository secret used by .github/workflows/deploy.yml
az staticwebapp secrets list --name dj-flow-lab --resource-group rg-dj-flow-lab \
  --query properties.apiKey -o tsv | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --repo andreykukalev/dj-flow-lab
```

Without the GitHub CLI, paste the token from step 2 into **GitHub → Settings → Secrets and variables → Actions → New repository secret** with the name `AZURE_STATIC_WEB_APPS_API_TOKEN`.

The next push to `main` (or the next pull request update) deploys the app.

## Preview changes before applying

```sh
az deployment sub what-if --location westeurope \
  --template-file infra/main.bicep --parameters infra/main.bicepparam
```

## Remove stale preview environments

If a pull request's deploy fails with "maximum number of staging environments", list the previews and delete the ones whose pull request is closed (the name is the pull request number):

```sh
az staticwebapp environment list --name dj-flow-lab --resource-group rg-dj-flow-lab \
  --query "[?name!='default'].{name:name, hostname:hostname, status:status}" -o table
az staticwebapp environment delete --name dj-flow-lab --resource-group rg-dj-flow-lab \
  --environment-name <number> --yes
```

The portal has the same list under the Static Web App's **Environments** page.

## Rotate the deployment token

```sh
az staticwebapp secrets reset-api-key --name dj-flow-lab --resource-group rg-dj-flow-lab
```

Then repeat step 3.

## Remove everything

```sh
az group delete --name rg-dj-flow-lab
```
