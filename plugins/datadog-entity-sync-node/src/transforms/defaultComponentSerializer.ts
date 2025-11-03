import gitUrlParse from 'git-url-parse';

import type { ComponentEntity, Entity } from '@backstage/catalog-model';
import {
  ANNOTATION_SOURCE_LOCATION,
  getCompoundEntityRef,
  getEntitySourceLocation,
  isComponentEntity,
  parseEntityRef,
  RELATION_OWNED_BY,
  stringifyEntityRef,
} from '@backstage/catalog-model';
import { TECHDOCS_ANNOTATION } from '@backstage/plugin-techdocs-common';

import type { v2 } from '@datadog/datadog-api-client';

import { valueGuard } from '../utils/byChunk';

function ensureComponent(
  entity: Entity | ComponentEntity,
): asserts entity is ComponentEntity {
  if (!isComponentEntity(entity))
    throw new Error(
      `Only Components are allowed to be synced, and ${stringifyEntityRef(entity)} is not a component.`,
    );
}

export interface ExtraSerializationInfo {
  appBaseUrl?: string;
}
interface CodeRepositoryContext {
  provider: string;
  url: string;
  repositoryURL: string;
  path: string;
}

function resolveRepositoryInfo(
  entity: Entity,
): CodeRepositoryContext | undefined {
  if (entity.metadata.annotations?.[ANNOTATION_SOURCE_LOCATION]) {
    try {
      const sourceLocation = getEntitySourceLocation(entity);
      if (sourceLocation.type === 'url') {
        const parsedRepo = gitUrlParse(sourceLocation.target);
        return {
          provider: parsedRepo.source,
          url: parsedRepo.href,
          repositoryURL: `https://${parsedRepo.resource}/${parsedRepo.full_name}`,
          path: `${parsedRepo.filepath}/**`,
        };
      }
    } catch (err) {
      // there is no entity location.
    }
  }

  return undefined;
}

function getEntityRelationRefs(entity: Entity, type: string) {
  return entity.relations?.filter(relation => relation.type === type) ?? [];
}

function labelsToTags(entity: ComponentEntity) {
  const tags = Object.entries(entity.metadata.labels ?? {}).map(
    ([key, value]) => `${key}:${value}`,
  );

  if (entity.spec.system) {
    tags.push(`system:${entity.spec.system}`);
  }

  return tags;
}

const LINK_TYPES: string[] = ['runbook', 'doc', 'repo', 'dashboard', 'other'];

function* getDatadogStyleLinks(
  entity: ComponentEntity,
  repoContext?: CodeRepositoryContext,
  extraInfo?: ExtraSerializationInfo,
) {
  const hasTechDocs = Boolean(
    entity.metadata.annotations?.[TECHDOCS_ANNOTATION],
  );

  for (const { title, type, url } of entity.metadata.links ?? []) {
    if (title && url) {
      yield {
        name: title,
        type: type && LINK_TYPES.includes(type) ? type : 'other',
        url: url,
      };
    }
  }

  if (extraInfo?.appBaseUrl) {
    const ref = getCompoundEntityRef(entity);
    yield {
      name: 'Backstage',
      type: 'doc',
      provider: 'backstage',
      url: `${extraInfo.appBaseUrl}/catalog/${ref.namespace}/${ref.kind}/${ref.name}`,
    };

    if (hasTechDocs) {
      yield {
        name: 'TechDocs',
        type: 'doc',
        provider: 'backstage',
        url: `${extraInfo.appBaseUrl}/docs/${ref.namespace}/${ref.kind}/${ref.name}`,
      };
    }
  }

  if (repoContext) {
    yield {
      name: 'Source',
      type: 'repo',
      provider: repoContext.provider,
      url: repoContext.url,
    };
  }
}

/**
 * Default serializer for component entities to simplify configuration process.
 *
 * @throws Error if the entity is not a component.
 *
 * @param entity - The Backstage Catalog Entity to serialize (should be a component entity).
 * @param extraInfo - Optional context for serialization.
 * @returns Datadog EntityV3Service object for publishing to datadog software catalog.
 */
export function defaultComponentSerializer(
  entity: Entity | ComponentEntity,
  extraInfo?: ExtraSerializationInfo,
) {
  ensureComponent(entity);

  const { metadata, spec } = entity;
  const repoContext = resolveRepositoryInfo(entity);
  const entityOwnerRef = getEntityRelationRefs(entity, RELATION_OWNED_BY).at(0);

  return {
    apiVersion: 'v3',
    kind: 'service',
    metadata: {
      name:
        metadata.annotations?.['datadoghq.com/service-name'] ?? metadata.name,
      ...valueGuard(metadata.description, description => ({
        description,
      })),
      ...valueGuard(entityOwnerRef, ownerRef => ({
        owner: parseEntityRef(ownerRef.targetRef).name,
      })),
      tags: [...labelsToTags(entity), ...(metadata.tags ?? [])],
      ...valueGuard(
        Array.from(getDatadogStyleLinks(entity, repoContext, extraInfo)),
        links => ({
          links,
        }),
      ),
    },
    spec: {
      ...valueGuard(spec.lifecycle, lifecycle => ({
        lifecycle,
      })),
    },
    ...valueGuard(repoContext, repo => ({
      datadog: {
        codeLocations: [
          {
            repositoryURL: repo.repositoryURL,
            ...valueGuard(repo.path, path => ({
              paths: [path],
            })),
          },
        ],
      },
    })),
  } as v2.EntityV3Service;
}
