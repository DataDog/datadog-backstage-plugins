import { client, v2 } from '@datadog/datadog-api-client';
import type { Entity } from '@backstage/catalog-model';

import {
  coreServices,
  createServiceFactory,
  createServiceRef,
} from '@backstage/backend-plugin-api';

export type DatadogEntityDefinition = v2.EntityV3 | Entity;

/**
* Includes all methods from the original SoftwareCatalogApi, but swaps `upsertCatalogEntity` for
 * a version that accepts a raw Backstage Entity.
 */
export type DatadogCatalogApi = Omit<
  v2.SoftwareCatalogApi,
  'upsertCatalogEntity'
> & {
  upsertCatalogEntity(params: { body: DatadogEntityDefinition }): Promise<any>;
};

export const datadogEntityRef = createServiceRef<DatadogCatalogApi>({
  id: 'datadog.entity.api',
  scope: 'plugin',
  // eslint-disable-next-line @typescript-eslint/require-await
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        config: coreServices.rootConfig,
      },
      factory({ config }): DatadogCatalogApi {
        const site =
          config.getOptionalString('datadog.integration.site') ??
          'datadoghq.com';
        const apiKey = config.getString('datadog.integration.apiKey');
        const appKey = config.getString('datadog.integration.appKey');

        const ddConfig = client.createConfiguration({
          authMethods: { apiKeyAuth: apiKey, appKeyAuth: appKey },
          enableRetry: true,
        });
        ddConfig.setServerVariables({ site });
        const originalSdk = new v2.SoftwareCatalogApi(ddConfig);

        const customApi: DatadogCatalogApi = {
          ...(originalSdk as any),
          // custom override that sends raw Backstage entities
          async upsertCatalogEntity(params: { body: Entity }): Promise<any> {
            const response = await fetch(
              `https://api.${site}/api/v2/catalog/entity`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'DD-API-KEY': apiKey,
                  'DD-APPLICATION-KEY': appKey,
                },
                body: JSON.stringify(params.body),
              },
            );

            if (!response.ok) {
              const text = await response.text();
              throw new Error(`Datadog API error ${response.status}: ${text}`);
            }
            return response.json();
          },
        };

        return customApi;
      },
    }),
});
