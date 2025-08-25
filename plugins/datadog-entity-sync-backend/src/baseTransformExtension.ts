import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { eventsExtensionPoint } from '@backstage/plugin-events-node/alpha';

import type { DatadogEntitySyncConfig } from '@cvent/backstage-plugin-datadog-entity-sync-node';
import {
  datadogEntitySyncExtensionPoint,
  defaultEntitySerializer,
} from '@cvent/backstage-plugin-datadog-entity-sync-node';

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

export const eventsBodyParser = createBackendModule({
  pluginId: 'events',
  moduleId: 'datadog-entity-sync-body-parsers',
  register(env) {
    env.registerInit({
      deps: { events: eventsExtensionPoint },
      // eslint-disable-next-line @typescript-eslint/require-await
      async init({ events }) {
        // Accept text/plain (optionally parse JSON if callers send JSON-as-text)
        events.addHttpPostBodyParser({
          contentType: 'text/plain',
          // eslint-disable-next-line @typescript-eslint/require-await
          parser: async req => {
            if (!req.body) {
              throw new Error('Request body is empty');
            }

            let text: string;
            if (Buffer.isBuffer(req.body)) {
              text = req.body.toString('utf-8');
            } else {
              text = String(req.body);
            }

            let parsed: unknown = text;
            parsed = JSON.parse(text);

            return {
              bodyParsed: parsed,
              bodyBuffer: Buffer.from(text, 'utf-8'),
              encoding: 'utf-8',
            };
          },
        });
      },
    });
  },
});
