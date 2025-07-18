import { strict as assert } from 'node:assert';

import type { AuthService } from '@backstage/backend-plugin-api';
import type { EntityFilterQuery } from '@backstage/catalog-client';
import { CATALOG_FILTER_EXISTS } from '@backstage/catalog-client';
import { stringifyEntityRef } from '@backstage/catalog-model';
import type { Entity } from '@backstage/catalog-model';
import type { catalogServiceRef } from '@backstage/plugin-catalog-node';
import type { EventParams, EventsService } from '@backstage/plugin-events-node';

import type { BaseScheduledSyncOptions } from '@cvent/backstage-plugin-datadog-entity-sync-node';
import type {
  DatadogEntityDefinition,
  datadogEntityRef,
} from '@cvent/backstage-plugin-datadog-entity-sync-node';
import {
  BaseScheduledSync,
  defaultComponentSerializer,
} from '@cvent/backstage-plugin-datadog-entity-sync-node';

import type { SyncConfig } from '../extensions';
import type { RateLimit } from '../utils/byChunk';
import { byChunkAsync } from '../utils/byChunk';

interface Clients {
  datadog: NonNullable<typeof datadogEntityRef.T>;
  catalog: typeof catalogServiceRef.T;
  auth: AuthService;
  events: EventsService;
}

export type SingleEntityFilterQuery<FIlter = EntityFilterQuery> =
  FIlter extends (infer SingleFilter)[] ? SingleFilter : FIlter;

export interface DatadogServiceFromEntitySyncOptions<Preload = unknown>
  extends BaseScheduledSyncOptions,
    Omit<SyncConfig, 'schedule'> {
  serialize?: (entity: Entity, preload: Preload) => DatadogEntityDefinition;
  preload?: (clients: Clients, entities: Entity[]) => Promise<Preload>;
}

export class DatadogServiceFromEntitySync<
  PreloadedData,
> extends BaseScheduledSync {
  readonly #clients: Clients;
  readonly #topicId: string;
  readonly #enabled?: boolean;

  #entityFilter: EntityFilterQuery = {
    kind: 'Component',
  };

  #rateLimit: RateLimit = {
    count: 300,
    interval: { hours: 1 },
  };

  protected preload?: (
    clients: Clients,
    entities: Entity[],
  ) => Promise<PreloadedData>;

  constructor(
    clients: Clients,
    options: DatadogServiceFromEntitySyncOptions<PreloadedData>,
  ) {
    super({
      ...options,
      logger: options.logger.child({ syncEnabled: options.enabled }),
    });

    if (options.preload) this.preload = options.preload;
    if (options.serialize) this.serialize = options.serialize;
    this.#entityFilter = options.entityFilter ?? this.#entityFilter;
    this.#rateLimit = options.rateLimit ?? this.#rateLimit;
    this.#clients = clients;
    this.#enabled = options.enabled;
    this.#topicId = `datadog-entity-sync.${this.syncId}`;
    void this.#clients.events.subscribe({
      id: this.syncId,
      topics: [this.#topicId],
      onEvent: this.eventSync.bind(this),
    });
  }

  scheduledSync() {
    void this.sync();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async eventSync(
    { eventPayload }: EventParams = {
      topic: this.#topicId,
      eventPayload: {},
    },
  ) {
    if (validateEventParams(eventPayload)) {
      void this.sync(eventPayload.entityFilter, eventPayload.dryRun);
    }

    this.logger.warn(`Then event was is invalid.`);
  }

  async sync(filter: SingleEntityFilterQuery = {}, dryRun?: boolean) {
    const syncEnabled = Boolean(this.#enabled && dryRun);
    this.tracker.start(
      `A ${syncEnabled ? 'dry run' : 'live'} sync to datadog has started.`,
    );

    const entityFilterQuery = mergeEntityFilters(filter, this.#entityFilter);

    const { items: entities } = await this.#clients.catalog.getEntities(
      { filter: entityFilterQuery },
      { credentials: await this.#clients.auth.getOwnServiceCredentials() },
    );

    const preload = await this.preload?.(this.#clients, entities);

    this.tracker.log.info(
      `Syncing ${String(entities.length)} entities to datadog.`,
    );

    const syncedServices = await byChunkAsync(
      entities,
      this.#rateLimit,
      chunk => this.#syncEntities(chunk, preload, syncEnabled),
    );

    this.tracker.log.info(
      `Finished syncing ${String(syncedServices.length)} services to datadog.`,
    );
    return syncedServices;
  }

  async *#syncEntities(
    entities: Entity[],
    preload?: PreloadedData,
    dryRun?: boolean,
  ) {
    for (const entity of entities) {
      const logger = this.tracker.log.child({
        entityRef: stringifyEntityRef(entity),
      });
      try {
        const entityTitle = entity.metadata.title ?? entity.metadata.name;
        const service = this.serialize(entity, preload);
        assert(
          service,
          `The entity ${entityTitle} was unable to be processed.`,
        );

        if (!this.#enabled || dryRun) {
          logger.info(
            `The entity ${entityTitle} was not synced due to the sync being disabled.`,
          );

          yield service;
        } else {
          yield await this.#clients.datadog.upsertCatalogEntity({
            body: service,
          });
        }
      } catch (err) {
        if (err instanceof Error)
          logger.error(
            'An issue occurred with creating a datadog service definition.',
            err,
          );
      }
    }
  }

  protected serialize(
    entity: Entity,
    _preload?: PreloadedData,
  ): DatadogEntityDefinition {
    return defaultComponentSerializer(entity);
  }
}

function mergeEntityFilters(
  queryFilter: SingleEntityFilterQuery,
  configFilter: EntityFilterQuery,
) {
  return [configFilter].flat().map(filter => ({
    ...queryFilter,
    ...convertCatalogFilterExistsStringToSymbol(filter),
  }));
}

function convertCatalogFilterExistsStringToSymbol({
  ...filter
}: SingleEntityFilterQuery) {
  for (const [key, value] of Object.entries(filter)) {
    if (value === 'CATALOG_FILTER_EXISTS') {
      filter[key] = CATALOG_FILTER_EXISTS;
    }
  }

  return filter;
}

function validateEventParams(
  params: unknown,
): params is { entityFilter: SingleEntityFilterQuery; dryRun?: boolean } {
  if (isObject(params) && 'entityFilter' in params) {
    const { entityFilter } = params;
    if (isObject(entityFilter)) {
      return true;
    }
  }

  return false;
}

function isObject(object: unknown) {
  return typeof object === 'object' && object !== null;
}
