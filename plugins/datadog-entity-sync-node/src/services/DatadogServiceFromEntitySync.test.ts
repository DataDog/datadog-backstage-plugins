import { v2 } from '@datadog/datadog-api-client';

import { mockServices } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';

import { defaultComponentSerializer } from '../transforms/defaultComponentSerializer';

import { DatadogServiceFromEntitySync } from './DatadogServiceFromEntitySync';

const MockedSoftwareCatalogApi =
  v2.SoftwareCatalogApi as jest.Mock<v2.SoftwareCatalogApi>;

jest.mock('@datadog/datadog-api-client');

const MOCKED_ENTITIES = [
  {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'datadog-example-apm-service',
      title: 'Datadog Apm Service',
      annotations: {
        'datadoghq.com/service-name': 'datadog-example-apm-service',
        'backstage.io/techdocs-ref': './',
      },
    },
    spec: {
      type: 'service',
      system: 'datadog-example',
      lifecycle: 'experimental',
    },
    relations: [
      {
        type: 'ownedBy',
        targetRef: 'group:default/example-team',
      },
    ],
  },
].flatMap(entity => Array<typeof entity>(7).fill(entity));

const DEFAULT_RESPONSE = {
  apiVersion: 'v3',
  kind: 'service',
  metadata: {
    name: 'datadog-example-apm-service',
    links: [
      {
        name: 'Backstage',
        provider: 'backstage',
        type: 'doc',
        url: 'https://backstage/catalog/default/Component/datadog-example-apm-service',
      },
      {
        name: 'TechDocs',
        provider: 'backstage',
        type: 'doc',
        url: 'https://backstage/docs/default/Component/datadog-example-apm-service',
      },
    ],
    tags: ['system:datadog-example'],
    owner: 'example-team',
  },
  spec: {
    lifecycle: 'experimental',
  },
};

describe('DatadogServiceFromEntitySync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('with a custom serializer', () => {
    const sync = new DatadogServiceFromEntitySync(
      {
        datadog: new MockedSoftwareCatalogApi(),
        catalog: catalogServiceMock({ entities: MOCKED_ENTITIES }),
        auth: mockServices.auth.mock(),
        events: mockServices.events.mock(),
      },
      {
        syncId: 'test',
        taskRunner: mockServices.scheduler.mock().createScheduledTaskRunner({
          frequency: {
            milliseconds: 30,
          },
          timeout: {
            seconds: 1,
          },
        }),
        serialize: entity =>
          defaultComponentSerializer(entity, {
            appBaseUrl: 'https://backstage',
          }),
        rateLimit: {
          count: 2,
          interval: {
            seconds: 1,
          },
        },
        logger: mockServices.logger.mock(),
      },
    );

    it('returns expected public response', async () => {
      const syncedServices = await sync.sync();

      expect(syncedServices).toEqual(Array(7).fill(DEFAULT_RESPONSE));
    });
  });

  describe('with the default serializer', () => {
    const sync = new DatadogServiceFromEntitySync(
      {
        datadog: new MockedSoftwareCatalogApi(),
        catalog: catalogServiceMock({ entities: MOCKED_ENTITIES }),
        auth: mockServices.auth.mock(),
        events: mockServices.events.mock(),
      },
      {
        syncId: 'test',
        taskRunner: mockServices.scheduler.mock().createScheduledTaskRunner({
          frequency: {
            milliseconds: 30,
          },
          timeout: {
            seconds: 1,
          },
        }),
        rateLimit: {
          count: 2,
          interval: {
            seconds: 1,
          },
        },
        logger: mockServices.logger.mock(),
      },
    );

    it('returns expected public response', async () => {
      const syncedServices = await sync.sync();
      const mockedResponse = {
        ...DEFAULT_RESPONSE,
        metadata: { ...DEFAULT_RESPONSE.metadata, links: [] },
      } as const;

      expect(syncedServices).toEqual(Array(7).fill(mockedResponse));
    });
  });
});
