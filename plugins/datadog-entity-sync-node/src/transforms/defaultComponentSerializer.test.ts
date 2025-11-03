import { cloneDeep } from 'lodash';

import type { Entity } from '@backstage/catalog-model';

import type { v2 } from '@datadog/datadog-api-client';

import type { ExtraSerializationInfo } from './defaultComponentSerializer';
import { defaultComponentSerializer } from './defaultComponentSerializer';

const defaultEntity: Entity = {
  apiVersion: 'backstage.io/v1beta3',
  kind: 'Component',
  metadata: {
    name: 'mocked-service',
    tags: ['tag1:value1', 'tag2:value2'],
  },
  spec: {
    type: 'application',
    lifecycle: 'production',
    owner: 'mocked-team',
  },
  relations: [
    {
      type: 'ownedBy',
      targetRef: 'group:default/mocked-team',
    },
  ],
};

const defaultExtraInfo: ExtraSerializationInfo = {
  appBaseUrl: 'https://backstage',
};

describe('defaultComponentSerializer', () => {
  let mockedEntity: Entity;

  beforeEach(() => {
    mockedEntity = cloneDeep(defaultEntity);
  });

  it('should transform a component entity into Datadog Software Catalog', () => {
    const serviceDefinition = defaultComponentSerializer(mockedEntity);

    expect(serviceDefinition).toBeDefined();
    expect(serviceDefinition).toEqual(
      expect.objectContaining({
        apiVersion: 'v3',
        kind: 'service',
        metadata: expect.objectContaining({
          name: 'mocked-service',
          owner: 'mocked-team',
          tags: expect.arrayContaining([
            'tag1:value1',
            'tag2:value2',
          ]) as string[],
        }) as v2.EntityV3Service['metadata'],
        spec: expect.objectContaining({
          lifecycle: 'production',
        }) as v2.EntityV3Service['spec'],
      }),
    );
  });

  it('should not transform a component entity into Datadog Service Catalog', () => {
    mockedEntity.kind = 'Group';

    expect(() => {
      defaultComponentSerializer(mockedEntity);
    }).toThrow(Error);
  });

  it('should allow overriding the service name with datadoghq.com/service-name annotation', () => {
    mockedEntity.metadata.annotations = {
      'datadoghq.com/service-name': 'mocked-service-override',
    };

    const serviceDefinition = defaultComponentSerializer(mockedEntity);

    expect(serviceDefinition).toBeDefined();
    expect(serviceDefinition.metadata.name).toBe('mocked-service-override');
  });

  it('should add backstage labels as additional tags', () => {
    mockedEntity.metadata.labels = { label1: 'value1', label2: 'value2' };

    const serviceDefinition = defaultComponentSerializer(mockedEntity);

    const tags = serviceDefinition.metadata.tags ?? [];

    expect(serviceDefinition).toBeDefined();
    expect(tags).toEqual(
      expect.arrayContaining([
        'label1:value1',
        'label2:value2',
        'tag1:value1',
        'tag2:value2',
      ]),
    );
  });

  it('should the system name as a tag', () => {
    mockedEntity.metadata.labels = {};
    mockedEntity.spec = {
      system: 'mocked-system',
    };

    const serviceDefinition = defaultComponentSerializer(
      mockedEntity,
      defaultExtraInfo,
    );

    const tags = serviceDefinition.metadata.tags ?? [];

    expect(serviceDefinition).toBeDefined();
    expect(tags).toContain('system:mocked-system');
  });

  it('should set the description', () => {
    mockedEntity.metadata.description = 'mocked-description';

    const serviceDefinition = defaultComponentSerializer(mockedEntity);

    expect(serviceDefinition).toBeDefined();
    expect(serviceDefinition.metadata.description).toBe('mocked-description');
  });

  it('should include links that are supported types', () => {
    mockedEntity.metadata.links = [
      {
        title: 'mocked-link',
        url: 'https://backstage/mocked',
        type: 'doc',
      },
    ];

    const serviceDefinition = defaultComponentSerializer(
      mockedEntity,
      defaultExtraInfo,
    );

    const links = serviceDefinition.metadata.links ?? [];

    expect(serviceDefinition).toBeDefined();
    expect(links).toEqual(
      expect.arrayContaining([
        {
          name: 'mocked-link',
          type: 'doc',
          url: 'https://backstage/mocked',
        },
      ]),
    );
  });

  it('should include a link to backstage if the base url is provided', () => {
    const serviceDefinition = defaultComponentSerializer(
      mockedEntity,
      defaultExtraInfo,
    );

    const links = serviceDefinition.metadata.links ?? [];

    expect(serviceDefinition).toBeDefined();
    expect(links).toEqual(
      expect.arrayContaining([
        {
          name: 'Backstage',
          provider: 'backstage',
          type: 'doc',
          url: 'https://backstage/catalog/default/Component/mocked-service',
        },
      ]),
    );
  });

  it('should include a link to techdocs if they are defined', () => {
    mockedEntity.metadata.annotations = {
      'backstage.io/techdocs-ref': './',
    };

    const serviceDefinition = defaultComponentSerializer(
      mockedEntity,
      defaultExtraInfo,
    );

    const links = serviceDefinition.metadata.links ?? [];

    expect(serviceDefinition).toBeDefined();
    expect(links).toEqual(
      expect.arrayContaining([
        {
          name: 'TechDocs',
          provider: 'backstage',
          type: 'doc',
          url: 'https://backstage/docs/default/Component/mocked-service',
        },
      ]),
    );
  });

  it('should include code locations if source-location is defined', () => {
    mockedEntity.metadata.annotations = {
      'backstage.io/source-location':
        'url:https://github.com/organization/repository-name/tree/master/packages/package-name/',
    };

    const serviceDefinition = defaultComponentSerializer(
      mockedEntity,
      defaultExtraInfo,
    );

    expect(serviceDefinition).toBeDefined();
    expect(serviceDefinition.datadog).toEqual(
      expect.objectContaining({
        codeLocations: expect.arrayContaining([
          {
            repositoryURL: 'https://github.com/organization/repository-name',
            paths: expect.arrayContaining([
              'packages/package-name/**',
            ]) as string[],
          },
        ]) as v2.EntityV3Service['datadog'],
      }),
    );
  });
});
