import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import {
  RELATION_OWNED_BY,
  stringifyEntityRef,
} from '@backstage/catalog-model';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';

import type { DatadogEntitySyncConfig } from '@datadog/backstage-plugin-datadog-entity-sync-node';
import { datadogEntitySyncExtensionPoint } from '@datadog/backstage-plugin-datadog-entity-sync-node';

import { datadogServiceFromComponentAndGroupSerializer } from './datadogServiceFromComponentAndGroupSerializer';

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
      // eslint-disable-next-line @typescript-eslint/require-await
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

            const ownerEntity = preload.items.find(
              owner => stringifyEntityRef(owner) === ownerRef,
            );

            return datadogServiceFromComponentAndGroupSerializer(
              entity,
              ownerEntity,
              {
                appBaseUrl,
                slackBaseUrl,
              },
            );
          },
        });
      },
    });
  },
});
