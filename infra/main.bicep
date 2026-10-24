// Provisions the Azure resources for DJ Flow Lab: one resource group and one
// Azure Static Web App. The app is a static site with no backend in the MVP.
//
// Deploy (see infra/README.md):
//   az deployment sub create --location westeurope --template-file infra/main.bicep --parameters infra/main.bicepparam

targetScope = 'subscription'

@description('Resource group that holds the app.')
param resourceGroupName string = 'rg-dj-flow-lab'

@description('Region for the resource group and the Static Web App resource.')
@allowed([
  'westeurope'
  'eastus2'
  'centralus'
  'westus2'
  'eastasia'
])
param location string = 'westeurope'

@description('Static Web App resource name (unique within the resource group). Azure generates the *.azurestaticapps.net hostname.')
@minLength(2)
@maxLength(40)
param appName string = 'dj-flow-lab'

@allowed([
  'Free'
  'Standard'
])
param skuName string = 'Free'

var tags = {
  app: 'DJ Flow Lab'
  repository: 'andreykukalev/dj-flow-lab'
}

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module staticWebApp 'modules/staticWebApp.bicep' = {
  name: 'staticWebApp'
  scope: resourceGroup
  params: {
    name: appName
    location: location
    skuName: skuName
    tags: tags
  }
}

output resourceGroupName string = resourceGroup.name
output staticWebAppName string = staticWebApp.outputs.name
output url string = 'https://${staticWebApp.outputs.defaultHostname}'
