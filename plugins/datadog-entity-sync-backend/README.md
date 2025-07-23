# Datadog Entity Sync Backend

This plugin backend is used to sync a Backstage catalog with a Datadog service catalog.

## Installation

This plugin is installed via the `@cvent/backstage-plugin-datadog-entity-sync-backend` package. To install it to your backend package, run the following command:

```bash
# From your root directory
yarn workspace backend add @cvent/backstage-plugin-datadog-entity-sync-backend
```

Then add the plugin to your backend in `packages/backend/src/index.ts`:

```typescript
const backend = createBackend();
// ...
backend.add(import('@cvent/backstage-plugin-datadog-entity-sync-backend'));
```

## Configuration

Here is an example configuration that you can leverage:

```yaml
events:
  http:
    topics:
      # This name must match the sync name defined below and in the extension
      - datadog-entity-sync.datadog-entities-from-catalog

datadog:
  integration:
    apiKey: ${DD_API_KEY}
    appKey: ${DD_APP_KEY}
    site: 'datadoghq.com' # Optional: Defaults to 'datadoghq.com'
  sync:
    # This name must match the topic part name above and in the extension
    datadog-entities-from-catalog:
      entityFilter:
        kind: ["component", "api", "system", "resource"]
        # Adjust to your identifier in Datadog
        metadata.annotations.datadoghq.com/service-name: CATALOG_FILTER_EXISTS
      rateLimit:
        count: 60
        interval:
          minutes: 1
      schedule:
        frequency:
          cron: '1 1 * * *' # Set to your preferred schedule
        timeout:
          minutes: 10
      enabled: false # Change to true in production
```

## Customization

In order to customize what entities are synced to Datadog and how the entities are serialized before syncing, there is an "extension point" which can be used to customize these options.

### Basic Configuration

This is the base extension point included in the `@cvent/backstage-plugin-datadog-entity-sync-backend` package. You can add it to your backend as follows:

```typescript
import { datadogEntitySyncSerializer } from '@cvent/backstage-plugin-datadog-entity-sync-backend';
const backend = createBackend();
// ...
backend.add(import('@cvent/backstage-plugin-datadog-entity-sync-backend'));
backend.add(defaultEntitySerializer);
```

### Default Component Serializer

Here is the implementation of the defaultComponentserializer:

```typescript
import {
  coreServices,
  createBackendModule,
  SchedulerServiceTaskScheduleDefinition,
} from '@backstage/backend-plugin-api';
import { EntityFilterQuery } from '@backstage/catalog-client';
import { defaultComponentSerializer } from '@cvent/backstage-plugin-datadog-entity-sync-node';
import { datadogEntitySyncExtensionPoint } from '@cvent/backstage-plugin-datadog-entity-sync-node';

const SYNC_ID = 'datadog-service-from-component';

export const datadogServiceFromComponentAndGroupSync = createBackendModule({
  pluginId: 'datadog-entity-sync',
  moduleId: SYNC_ID,
  register(registrar) {
    registrar.registerInit({
      deps: {
        auth: coreServices.auth,
        config: coreServices.rootConfig,
        scheduler: coreServices.scheduler,
        catalog: catalogServiceRef,
        datadogSync: datadogEntitySyncExtensionPoint,
      },
      async init({ datadogSync, config, scheduler, catalog, auth }) {
        const { entityFilter, rateLimit, schedule, enabled } =
          config.get<DatadogEntitySyncConfig>(`datadog.sync.${SYNC_ID}`);
        const appBaseUrl = config.getString('app.baseUrl');

        datadogSync.defineSerializer({
          taskRunner: scheduler.createScheduledTaskRunner(schedule),
          entityFilter,
          rateLimit,
          serialize: defaultComponentSerializer,
          id: SYNC_ID,
        });
      },
    });
  },
});
```

The `serializeEntity` function takes an entity (and an optional preloaded dataset) and returns an `EntityV3`.
You can specify a set of data to be "preloaded" when a sync starts that will be passed to the `serializeEntity` function.

Below is an example where we retrieve additional data from the owning teams to add to the entity:

```typescript
import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import {
  RELATION_OWNED_BY,
  stringifyEntityRef,
} from '@backstage/catalog-model';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';

import type { DatadogEntitySyncConfig } from '@cvent/backstage-plugin-datadog-entity-sync-node';
import { datadogEntitySyncExtensionPoint } from '@cvent/backstage-plugin-datadog-entity-sync-node';

const SYNC_ID = 'datadog-service-from-component-with-teams';

export const datadogServiceFromComponentAndGroupSync = createBackendModule({
  pluginId: 'datadog-entity-sync',
  moduleId: SYNC_ID,
  register(registrar) {
    registrar.registerInit({
      deps: {
        auth: coreServices.auth,
        config: coreServices.rootConfig,
        scheduler: coreServices.scheduler,
        catalog: catalogServiceRef,
        datadogSync: datadogEntitySyncExtensionPoint,
      },
      async init({ datadogSync, config, scheduler, catalog, auth }) {
        const { entityFilter, rateLimit, schedule, enabled } =
          config.get<DatadogEntitySyncConfig>(`datadog.sync.${SYNC_ID}`);
        const appBaseUrl = config.getString('app.baseUrl');
        const slackBaseUrl = config.getOptionalString(
          'slack.integrations.baseUrl',
        );

        datadogSync.defineSerializer({
          syncId: SYNC_ID,
          taskRunner: scheduler.createScheduledTaskRunner(schedule),
          entityFilter,
          rateLimit,
          enabled,
          preload: async () =>
            catalog.getEntities(
              {
                filter: { kind: 'group' },
                fields: [
                  'spec.contacts',
                  'metadata.name',
                  'kind',
                  'metadata.namespace',
                  'relations',
                ],
              },
              { credentials: await auth.getOwnServiceCredentials() },
            ),
          serialize: (entity, preload) => {
            const ownerRef = entity.relations?.find(
              relation => relation.type === RELATION_OWNED_BY,
            )?.targetRef;

            const ownerEntity = preload?.items.find(
              owner => stringifyEntityRef(owner) === ownerRef,
            );

            return {
              ...defaultComponentSerializer(entity, { appBaseUrl }),
              metadata: {
                ...defaultSerialization.metadata,
                ...valueGuard(
                  isGroupWithContacts(team) && getSlackChannels(team),
                  slackChannels => ({
                    contacts: slackChannels.map(slackChannel => ({
                      type: 'slack',
                      name: `#${slackChannel}`,
                      contact: `${slackBaseUrl}/archives/${slackChannel}`,
                    })),
                  }),
                ),
              },
            };
          },
        });
      },
    });
  },
});
```

## Triggering Sync Operations

### Manual Sync Trigger

To manually trigger a sync, you can issue an event with the topic of `datadog-entity-sync.<SYNC_ID>` with an entity filter. If you register the event as a webhook endpoint, you can trigger it via an HTTP call.

> **NOTE**: In all examples below, the `SYNC_ID` is `datadog-service-from-component`.

```bash
curl --request POST \
  --url https://backstage.myhost.net/api/events/http/datadog-entity-sync.datadog-service-from-component \
  --data '{
  "entityFilter": {
    "metadata.name": "my-entity-name"
  }
}'
```

The entity filter uses the standard Backstage entity filter format.

### Preview Serialized Entities

The plugin provides a "serialize" endpoint that lets you preview how entities will appear in Datadog before they're actually synced. This is useful for testing and verification purposes. The endpoint accepts an optional `entityFilter` query parameter to filter the scope of entities serialized.  It uses the standard Backstage filter syntax.

```bash
# Get all entities within the sync's configured scope
curl --request GET \
  --url 'https://backstage.myhost.net/api/datadog-entity-sync/serialize/datadog-service-from-component'

# Filter entities using Backstage entity filter syntax
curl --request GET \
  --url 'https://backstage.myhost.net/api/datadog-entity-sync/serialize/datadog-service-from-component?entityFilter=spec.type=application,relations.ownedBy=my-team'
```

## Development

This plugin backend can be started in standalone mode directly from this package with:

```bash
yarn start
```

This provides a limited setup that is convenient when developing the plugin backend itself.

If you want to run the entire project, including the frontend, run:

```bash
# From the root directory
yarn start
```

## Troubleshooting

Ensure that your node version is v22 or higher. 