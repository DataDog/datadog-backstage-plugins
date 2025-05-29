import type { SchedulerServiceTaskScheduleDefinition } from '@backstage/backend-plugin-api';
import { createExtensionPoint } from '@backstage/backend-plugin-api';
import type { EntityFilterQuery } from '@backstage/catalog-client';
import type { HumanDuration } from '@backstage/types';

import type { DatadogServiceFromEntitySyncOptions } from './services/DatadogServiceFromEntitySync';

interface RateLimit {
  count: number;
  interval: HumanDuration;
}

export interface SyncConfig {
  schedule: SchedulerServiceTaskScheduleDefinition;
  entityFilter?: EntityFilterQuery;
  rateLimit?: RateLimit;
  enabled?: boolean;
}

export type AllSyncConfigs = Record<string, SyncConfig>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DatadogServiceFromEntitySerializer<Preload = any> = Omit<
  DatadogServiceFromEntitySyncOptions<Preload>,
  'logger'
>;

interface DatadogEntitySyncExtensionPoint {
  defineSerializer<Preload = unknown>(
    serializer: DatadogServiceFromEntitySerializer<Preload>,
  ): void;
}

export const datadogEntitySyncExtensionPoint =
  createExtensionPoint<DatadogEntitySyncExtensionPoint>({
    id: 'datadog-entity-sync.define-serializer',
  });
