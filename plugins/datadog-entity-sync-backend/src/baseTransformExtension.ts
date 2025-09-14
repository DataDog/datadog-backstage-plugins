import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';

import type { DatadogEntitySyncConfig } from '@datadog/backstage-plugin-datadog-entity-sync-node';
import {
  datadogEntitySyncExtensionPoint,
  defaultEntitySerializer,
} from '@datadog/backstage-plugin-datadog-entity-sync-node';

const SYNC_ID = 'datadog-entities-from-catalog';

export const datadogEntitySyncSerializer = createBackendModule({
  pluginId: 'datadog-entity-sync',
  moduleId: SYNC_ID,
  register(registrar) {
    registrar.registerInit({
      deps: {
        config: coreServices.rootConfig,
        scheduler: coreServices.scheduler,
        datadogSync: datadogEntitySyncExtensionPoint,
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      async init({ datadogSync, config, scheduler }) {
        const { entityFilter, rateLimit, schedule, enabled } =
          config.get<DatadogEntitySyncConfig>(`datadog.sync.${SYNC_ID}`);

        datadogSync.defineSerializer({
          syncId: SYNC_ID,
          entityFilter,
          serialize: entity => defaultEntitySerializer(entity),
          rateLimit,
          enabled,
          taskRunner: scheduler.createScheduledTaskRunner(schedule),
        });
      },
    });
  },
});
