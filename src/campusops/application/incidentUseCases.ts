import type { IncidentRepository } from '../domain/incidents';

export function createIncidentUseCases(repository: IncidentRepository) {
  return {
    listIncidents: () => repository.list(),
    getIncident: (id: string) => repository.getById(id),
  };
}
