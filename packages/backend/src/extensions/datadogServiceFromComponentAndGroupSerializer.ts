import { isGroupEntity } from '@backstage/catalog-model';
import type {
  ComponentEntity,
  Entity,
  GroupEntity,
} from '@backstage/catalog-model';

import type {
  DatadogEntityDefinition,
  ExtraSerializationInfo,
} from '@datadog/backstage-plugin-datadog-entity-sync-node';
import { defaultComponentSerializer } from '@datadog/backstage-plugin-datadog-entity-sync-node';

interface GroupWithContacts extends GroupEntity {
  spec: GroupEntity['spec'] & {
    contacts?: {
      type: 'slack-channel' | 'slack-handle';
      value: string;
    }[];
  };
}

export function datadogServiceFromComponentAndGroupSerializer(
  entity: ComponentEntity | Entity,
  team?: GroupWithContacts | Entity,
  extraInfo?: {
    slackBaseUrl?: string;
  } & ExtraSerializationInfo,
): DatadogEntityDefinition {
  const { slackBaseUrl } = extraInfo ?? {};
  const defaultSerialization = defaultComponentSerializer(entity, extraInfo);

  if (team?.metadata.name) {
    defaultSerialization.metadata.owner = team.metadata.name;
  }

  if (slackBaseUrl && isGroupWithContacts(team)) {
    defaultSerialization.metadata.contacts = getSlackChannels(team).map(
      slackChannel => ({
        type: 'slack',
        name: `#${slackChannel}`,
        contact: `${slackBaseUrl}/archives/${slackChannel}`,
      }),
    );
  }

  return defaultSerialization;
}

function getSlackChannels({ spec: { contacts = [] } }: GroupWithContacts) {
  return contacts
    .filter(contact => contact.type === 'slack-channel')
    .map(contact => contact.value.replace(/^[#@]/, ''));
}

function isGroupWithContacts(
  team?: Entity | GroupWithContacts,
): team is GroupWithContacts {
  return Boolean(
    team &&
    isGroupEntity(team) &&
    'contacts' in team.spec &&
    Array.isArray(team.spec.contacts),
  );
}
