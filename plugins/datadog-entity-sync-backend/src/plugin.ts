import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { eventsServiceRef } from '@backstage/plugin-events-node';

import type { DatadogServiceFromEntitySerializer } from '@cvent/backstage-plugin-datadog-entity-sync-node';
import {
  datadogEntityRef,
  DatadogServiceFromEntitySync,
} from '@cvent/backstage-plugin-datadog-entity-sync-node';
import { datadogEntitySyncExtensionPoint } from '@cvent/backstage-plugin-datadog-entity-sync-node';

import { createRouter } from './router';

/**
 * datadogServicesPlugin backend plugin
 *
 * @public
 */
export const datadogServicesPlugin = createBackendPlugin({
  pluginId: 'datadog-entity-sync',
  register(env) {
    const serializers = new Map<string, DatadogServiceFromEntitySerializer>();
    env.registerExtensionPoint(datadogEntitySyncExtensionPoint, {
      defineSerializer(serializer) {
        serializers.set(serializer.syncId, serializer);
      },
    });
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        auth: coreServices.auth,
        httpRouter: coreServices.httpRouter,
        catalog: catalogServiceRef,
        datadog: datadogEntityRef,
        events: eventsServiceRef,
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      async init({ logger, httpRouter, ...deps }) {
        const datadogSyncs = new Map(
          serializers.entries().map(([id, serializer]) => [
            id,
            new DatadogServiceFromEntitySync(deps, {
              ...serializer,
              logger: logger.child({ syncId: id }),
            }),
          ]),
        );

        httpRouter.use(
          createRouter({
            datadogSyncs,
          }),
        );
      },
    });
  },
});
