import type {
  IncidentCategory,
  IncidentStatus,
} from '../contracts';

export type Incident = Readonly<{
  id: string;
  title: string;
  description: string;
  category: IncidentCategory;
  locationLabel: string;
  status: IncidentStatus;
}>;

export interface IncidentRepository {
  list(): Promise<readonly Incident[]>;
  getById(id: string): Promise<Incident | null>;
}

const categories: readonly IncidentCategory[] = [
  'electrical',
  'laboratory',
  'water',
  'connectivity',
  'equipment',
  'safety',
  'maintenance',
];

const statuses: readonly IncidentStatus[] = [
  'open',
  'assigned',
  'in_progress',
  'resolved',
  'closed',
];

/** Checks data crossing into the domain before it is presented to the app. */
export function isValidIncident(value: unknown): value is Incident {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const incident = value as Record<string, unknown>;
  return [incident.id, incident.title, incident.description, incident.locationLabel]
    .every((field) => typeof field === 'string' && field.trim().length > 0)
    && typeof incident.category === 'string'
    && categories.includes(incident.category as IncidentCategory)
    && typeof incident.status === 'string'
    && statuses.includes(incident.status as IncidentStatus);
}