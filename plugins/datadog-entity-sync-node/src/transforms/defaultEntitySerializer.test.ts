import { cloneDeep } from 'lodash';

import type { Entity, ComponentEntity, ApiEntity, SystemEntity, ResourceEntity } from '@backstage/catalog-model';

import type { ExtraSerializationInfo } from './defaultEntitySerializer';
import { defaultEntitySerializer } from './defaultEntitySerializer';

const defaultComponentEntity: ComponentEntity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
        name: 'mocked-service',
        tags: ['tag1:value1', 'tag2:value2'],
    },
    spec: {
        type: 'service',
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

const defaultApiEntity: ApiEntity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'API',
    metadata: {
        name: 'mocked-api',
        tags: ['api-tag1', 'api-tag2'],
    },
    spec: {
        type: 'openapi',
        lifecycle: 'production',
        owner: 'api-team',
        definition: `
        openapi: "3.0.0"
        info:
          version: 1.2.0
          title: Mock API
          description: mock API for testing
        servers:
          - url: https://api.example.com/v1/mock
            description: mock server
        paths:
          /mock/{mockId}:
            get:
              summary: Get mock
              parameters:
                - name: mockId
                  in: path
                  required: true
                  schema:
                    type: string
                    format: uuid
              responses:
                '200':
                  description: mock data
                  content:
                    application/json:
                      schema:
                        $ref: '#/components/schemas/Mock'
                '404':
                  description: mock not found
        `,
    },
    relations: [
        {
            type: 'ownedBy',
            targetRef: 'group:default/api-team',
        },
    ],
};

const defaultSystemEntity: SystemEntity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'System',
    metadata: {
        name: 'mocked-system',
        tags: ['system-tag'],
    },
    spec: {
        owner: 'system-team',
    },
    relations: [
        {
            type: 'ownedBy',
            targetRef: 'group:default/system-team',
        },
    ],
};

const defaultResourceEntity: ResourceEntity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Resource',
    metadata: {
        name: 'mocked-database',
        tags: ['database'],
    },
    spec: {
        type: 'database',
        owner: 'database-team',
    },
    relations: [
        {
            type: 'ownedBy',
            targetRef: 'group:default/database-team',
        },
    ],
};

const defaultExtraInfo: ExtraSerializationInfo = {
    appBaseUrl: 'https://backstage.example.com',
};

describe('defaultEntitySerializer', () => {
    describe('Component entities', () => {
        let mockedEntity: ComponentEntity;

        beforeEach(() => {
            mockedEntity = cloneDeep(defaultComponentEntity);
        });

        it('should preserve the original entity structure while adding enrichments', () => {
            const result = defaultEntitySerializer(mockedEntity);

            expect(result).toBeDefined();
            expect(result.metadata.name).toBe('mocked-service');
            expect(result.metadata.owner).toBe('mocked-team');
            expect(result.metadata.tags).toEqual(expect.arrayContaining([
                'tag1:value1',
                'tag2:value2',
            ]));
            expect(result.apiVersion).toBe(mockedEntity.apiVersion);
            expect(result.kind).toBe(mockedEntity.kind);
            expect(result.spec).toEqual(expect.objectContaining(mockedEntity.spec));
        });

        it('should combine labels as tags with existing metadata tags', () => {
            mockedEntity.metadata.labels = {
                environment: 'production',
                team: 'backend'
            };

            const result = defaultEntitySerializer(mockedEntity);

            expect(result.metadata.tags).toEqual(
                expect.arrayContaining([
                    'environment:production',
                    'team:backend',
                    'tag1:value1',
                    'tag2:value2',
                ])
            );
        });

        it('should set the description', () => {
            mockedEntity.metadata.description = 'A mocked service for testing';

            const result = defaultEntitySerializer(mockedEntity);

            expect(result).toBeDefined();
            expect(result.metadata.description).toBe('A mocked service for testing');
        });

        it('should resolve owner from relations', () => {
            const result = defaultEntitySerializer(mockedEntity);

            expect(result.metadata.owner).toBe('mocked-team');
        });

        it('should include links that are supported types', () => {
            mockedEntity.metadata.links = [
                {
                    title: 'Documentation',
                    url: 'https://example.com/docs',
                    type: 'doc',
                },
                {
                    title: 'Dashboard',
                    url: 'https://example.com/dashboard',
                    type: 'dashboard',
                },
            ];

            const result = defaultEntitySerializer(mockedEntity, defaultExtraInfo);

            const links = result.metadata.links ?? [];
            expect(links).toEqual(
                expect.arrayContaining([
                    {
                        name: 'Documentation',
                        type: 'doc',
                        url: 'https://example.com/docs',
                    },
                    {
                        name: 'Dashboard',
                        type: 'dashboard',
                        url: 'https://example.com/dashboard',
                    },
                ])
            );
        });

        it('should include a link to backstage if the base url is provided', () => {
            const result = defaultEntitySerializer(mockedEntity, defaultExtraInfo);

            const links = result.metadata.links ?? [];
            expect(links).toEqual(
                expect.arrayContaining([
                    {
                        name: 'Backstage',
                        type: 'doc',
                        provider: 'backstage',
                        url: 'https://backstage.example.com/catalog/default/Component/mocked-service',
                    },
                ])
            );
        });

        it('should include a link to techdocs if they are defined', () => {
            mockedEntity.metadata.annotations = {
                'backstage.io/techdocs-ref': './',
            };

            const result = defaultEntitySerializer(mockedEntity, defaultExtraInfo);

            const links = result.metadata.links ?? [];
            expect(links).toEqual(
                expect.arrayContaining([
                    {
                        name: 'TechDocs',
                        type: 'doc',
                        provider: 'backstage',
                        url: 'https://backstage.example.com/docs/default/Component/mocked-service',
                    },
                ])
            );
        });

        it('should include code locations when source-location is defined', () => {
            mockedEntity.metadata.annotations = {
                'backstage.io/source-location':
                    'url:https://github.com/example/repository/tree/main/services/my-service/',
            };

            const result = defaultEntitySerializer(mockedEntity, defaultExtraInfo);

            expect(result.datadog).toEqual({
                codeLocations: [
                    {
                        repositoryURL: 'https://github.com/example/repository',
                        paths: ['services/my-service/**'],
                    },
                ],
            });
        });

        it('should handle links with unsupported types by defaulting to "other"', () => {
            mockedEntity.metadata.links = [
                {
                    title: 'Custom Link',
                    url: 'https://example.com/custom',
                    type: 'unsupported-type',
                },
            ];

            const result = defaultEntitySerializer(mockedEntity);

            const links = result.metadata.links ?? [];
            expect(links).toEqual(
                expect.arrayContaining([
                    {
                        name: 'Custom Link',
                        type: 'other',
                        url: 'https://example.com/custom',
                    },
                ])
            );
        });
    });

    describe('API entities', () => {
        let mockedEntity: ApiEntity;

        beforeEach(() => {
            mockedEntity = cloneDeep(defaultApiEntity);
        });

        it('should serialize API entities successfully', () => {
            const result = defaultEntitySerializer(mockedEntity);

            expect(result).toBeDefined();
            expect(result.kind).toBe('API');
            expect(result.metadata.name).toBe('mocked-api');
            expect(result.metadata.owner).toBe('api-team');
        });
    });

    describe('System entities', () => {
        let mockedEntity: SystemEntity;

        beforeEach(() => {
            mockedEntity = cloneDeep(defaultSystemEntity);
        });

        it('should serialize System entities successfully', () => {
            const result = defaultEntitySerializer(mockedEntity);

            expect(result).toBeDefined();
            expect(result.kind).toBe('System');
            expect(result.metadata.name).toBe('mocked-system');
            expect(result.metadata.owner).toBe('system-team');
        });
    });

    describe('Resource entities', () => {
        let mockedEntity: ResourceEntity;

        beforeEach(() => {
            mockedEntity = cloneDeep(defaultResourceEntity);
        });

        it('should serialize Resource entities successfully', () => {
            const result = defaultEntitySerializer(mockedEntity);

            expect(result).toBeDefined();
            expect(result.kind).toBe('Resource');
            expect(result.metadata.name).toBe('mocked-database');
            expect(result.metadata.owner).toBe('database-team');
        });
    });

    describe('Error handling', () => {
        it('should throw an error for unsupported entity types', () => {
            const unsupportedEntity: Entity = {
                apiVersion: 'backstage.io/v1alpha1',
                kind: 'Group',
                metadata: {
                    name: 'unsupported-entity',
                },
                spec: {},
            };

            expect(() => {
                defaultEntitySerializer(unsupportedEntity);
            }).toThrow(
                'Only Components, APIs, Systems, and Resources are allowed to be synced, and group:default/unsupported-entity is not a component, api, system, or resource.'
            );
        });
    });

    describe('Edge cases', () => {
        let mockedEntity: ComponentEntity;

        beforeEach(() => {
            mockedEntity = cloneDeep(defaultComponentEntity);
        });

        it('should handle entities without relations', () => {
            delete mockedEntity.relations;

            const result = defaultEntitySerializer(mockedEntity);

            expect(result).toBeDefined();
            expect(result.metadata.owner).toBeUndefined();
        });

        it('should handle entities without tags', () => {
            delete mockedEntity.metadata.tags;

            const result = defaultEntitySerializer(mockedEntity);

            expect(result.metadata.tags).toEqual([]);
        });

        it('should handle entities without labels', () => {
            delete mockedEntity.metadata.labels;

            const result = defaultEntitySerializer(mockedEntity);

            const tags = result.metadata.tags ?? [];
            expect(tags).toEqual(['tag1:value1', 'tag2:value2']);
        });


        it('should handle invalid source-location annotations gracefully', () => {
            mockedEntity.metadata.annotations = {
                'backstage.io/source-location': 'invalid-url',
            };

            const result = defaultEntitySerializer(mockedEntity);

            expect(result.datadog).toBeUndefined();
        });
    });
}); 