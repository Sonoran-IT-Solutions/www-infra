import * as pulumi from '@pulumi/pulumi';
import * as resources from '@pulumi/azure-native/resources';
import * as db from '@pulumi/azure-native/dbforpostgresql';
import * as app from '@pulumi/azure-native/app';
import * as random from '@pulumi/random';

// Import the program's configuration settings.
const config = new pulumi.Config();
const resourceGroupName = config.get('resourceGroupName') || 'sits-www';
const imageTag = config.get('version') || 'latest';

// Database Config
const dbConfig = new pulumi.Config('db');
const dbSKU = dbConfig.get('sku') || 'Standard_B1ms';
const dbStorage = dbConfig.getNumber('storageGB') || 32;
const dbBackupDays = dbConfig.getNumber('bucketRetentionDays') || 7;

// Setup Resource Group
const resourceGroup = new resources.ResourceGroup('azure-resource-group', {
  resourceGroupName: resourceGroupName,
});

// Setup Database
const dbLogin = new random.RandomPet('db-login', {
  length: 1,
  prefix: 'directus',
  separator: '',
});

const dbPassword = new random.RandomPassword('db-password', {
  length: 32,
  special: true,
  overrideSpecial: '!@#$%^&*()-_+',
});

const dbServer = new db.Server(
  'directus-db-server',
  {
    // Meta
    resourceGroupName: resourceGroup.name,
    serverName: 'directus-db',
    location: resourceGroup.location,
    version: '16',
    // Billable Parameters
    sku: {
      tier: db.SkuTier.Burstable,
      name: dbSKU,
    },
    storage: {
      storageSizeGB: dbStorage,
    },
    // Auth
    administratorLogin: dbLogin.id,
    administratorLoginPassword: dbPassword.result,
    // Backups
    backup: {
      backupRetentionDays: dbBackupDays,
      geoRedundantBackup: db.GeoRedundantBackupEnum.Disabled,
    },
    // High Availability
    highAvailability: {
      mode: db.HighAvailabilityMode.Disabled,
    },
  },
  { parent: resourceGroup }
);

const database = new db.Database(
  'directus-database',
  {
    serverName: dbServer.name,
    resourceGroupName: resourceGroup.name,
    databaseName: 'directus',
  },
  { parent: dbServer }
);

// Setup Web App
const containerAppEnv = new app.ManagedEnvironment(
  'directus-app-environment',
  {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    environmentName: 'directus-prod',
    zoneRedundant: false,
  },
  { parent: resourceGroup }
);

const containerApp = new app.ContainerApp(
  'directus-container-app',
  {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    containerAppName: 'directus',
    environmentId: containerAppEnv.id,
    configuration: {
      secrets: [
        {
          name: 'dbPassword',
          value: dbPassword.result,
        },
      ],
    },
    template: {
      containers: [
        {
          name: 'directus',
          image: 'directus/directus:11.1',
          resources: {
            cpu: 0.5,
            memory: '1Gi',
          },
        },
      ],
    },
  },
  { parent: containerAppEnv }
);

// Outputs
export const azureResourceGroup = resourceGroup.name;
export const databaseName = database.name;
export const dbFQDN = dbServer.fullyQualifiedDomainName;
export const dbAdminUsername = dbLogin.id;
export const dbAdminPassword = dbPassword.result;
