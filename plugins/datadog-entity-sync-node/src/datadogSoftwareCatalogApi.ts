import { client, v2 } from '@datadog/datadog-api-client';

import {
  coreServices,
  createServiceFactory,
  createServiceRef,
} from '@backstage/backend-plugin-api';

export type DatadogEntityDefinition = v2.EntityV3;

export const datadogEntityRef = createServiceRef<v2.SoftwareCatalogApi>({
  id: 'datadog.v2.SoftwareCatalogApi',
  scope: 'plugin',
  // eslint-disable-next-line @typescript-eslint/require-await
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        config: coreServices.rootConfig,
      },
      factory({ config }) {
        const ddConfig = client.createConfiguration({
          authMethods: {
            apiKeyAuth: config.getString('datadog.integration.apiKey'),
            appKeyAuth: config.getString('datadog.integration.appKey'),
          },
          enableRetry: true,
        });

        ddConfig.setServerVariables({
          site:
            config.getOptionalString('datadog.integration.site') ??
            'datadoghq.com',
        });
        return new v2.SoftwareCatalogApi(ddConfig);
      },
    }),
});
