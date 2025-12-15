import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { eventsServiceRef } from '@backstage/plugin-events-node';

import type { DatadogServiceFromEntitySerializer } from '@datadog/backstage-plugin-datadog-entity-sync-node';
import {
  datadogEntityRef,
  DatadogServiceFromEntitySync,
} from '@datadog/backstage-plugin-datadog-entity-sync-node';
import { datadogEntitySyncExtensionPoint } from '@datadog/backstage-plugin-datadog-entity-sync-node';

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
          // Iterator.prototype.map() was introduced in Node 22.
          // Converting it to an array first for compatibility with pre node 22 runtimes.
          // serializers.entries().map(([id, serializer]) => [
          Array.from(serializers.entries()).map(([id, serializer]) => [
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
