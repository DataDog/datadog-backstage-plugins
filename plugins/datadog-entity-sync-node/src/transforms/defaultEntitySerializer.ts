import gitUrlParse from 'git-url-parse';

import type {
  ComponentEntity,
  ApiEntity,
  SystemEntity,
  ResourceEntity,
  Entity,
} from '@backstage/catalog-model';
import {
  ANNOTATION_SOURCE_LOCATION,
  getCompoundEntityRef,
  getEntitySourceLocation,
  isComponentEntity,
  isApiEntity,
  isSystemEntity,
  isResourceEntity,
  parseEntityRef,
  RELATION_OWNED_BY,
  stringifyEntityRef,
} from '@backstage/catalog-model';
import { TECHDOCS_ANNOTATION } from '@backstage/plugin-techdocs-common';

import { valueGuard } from '@cvent/backstage-plugin-datadog-entity-sync-node';

function ensureEntity(
  entity: Entity | ComponentEntity | ApiEntity | SystemEntity | ResourceEntity,
): asserts entity is
  | ComponentEntity
  | ApiEntity
  | SystemEntity
  | ResourceEntity {
  if (
    !(
      isComponentEntity(entity) ||
      isApiEntity(entity) ||
      isSystemEntity(entity) ||
      isResourceEntity(entity)
    )
  )
    throw new Error(
      `Only Components, APIs, Systems, and Resources are allowed to be synced, and ${stringifyEntityRef(entity)} is not a component, api, system, or resource.`,
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

function labelsToTags(
  entity: ComponentEntity | ApiEntity | SystemEntity | ResourceEntity,
) {
  const tags = Object.entries(entity.metadata.labels ?? {}).map(
    ([key, value]) => `${key}:${value}`,
  );

  return tags;
}

const LINK_TYPES: string[] = ['runbook', 'doc', 'repo', 'dashboard', 'other'];

function* getDatadogStyleLinks(
  entity: ComponentEntity | ApiEntity | SystemEntity | ResourceEntity,
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
 * Default serializer that preserves the original Backstage entity structure
 * while adding enrichments like resolved owner, combined tags, and auto-generated links.
 *
 * @throws Error if the entity is not a component, api, system, or resource.
 *
 * @param entity - The Backstage Catalog Entity to serialize (should be a component entity).
 * @param extraInfo - Optional context for serialization.
 * @returns Enhanced Backstage entity with enrichments for Datadog.
 */
export function defaultEntitySerializer(
  entity: Entity | ComponentEntity | ApiEntity | SystemEntity | ResourceEntity,
  extraInfo?: ExtraSerializationInfo,
) {
  ensureEntity(entity);

  const { metadata, spec } = entity;
  const repoContext = resolveRepositoryInfo(entity);
  const specOwnerRef = spec.owner;
  const entityOwnerRef = getEntityRelationRefs(entity, RELATION_OWNED_BY).at(0);

  return {
    ...entity, // Keep original entity structure
    metadata: {
      ...metadata,
      name:
        metadata.annotations?.['datadoghq.com/service-name'] ?? metadata.name,
      ...valueGuard(metadata.description, description => ({
        description,
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
      ...spec,
      ...valueGuard(specOwnerRef || entityOwnerRef, ownerRef => ({
        owner: typeof ownerRef === 'string' ? ownerRef : parseEntityRef(ownerRef.targetRef).name,
      })),
    },
  };
}
