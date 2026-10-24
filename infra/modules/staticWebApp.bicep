@description('Name of the Static Web App. Lowercase letters, digits and hyphens.')
param name string

@description('Azure region for the Static Web App resource. The content itself is served from a global CDN.')
param location string

@description('Free is enough for the MVP (3 preview environments). Standard adds more previews, custom auth and an SLA.')
@allowed([
  'Free'
  'Standard'
])
param skuName string = 'Free'

param tags object = {}

resource staticWebApp 'Microsoft.Web/staticSites@2024-11-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuName
  }
  properties: {
    // Deployments come from GitHub Actions with a deployment token ("Other" source),
    // so no repository link or build settings are configured here.
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
  }
}

output name string = staticWebApp.name
output defaultHostname string = staticWebApp.properties.defaultHostname
