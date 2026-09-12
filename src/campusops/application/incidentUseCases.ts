import type { IncidentRepository } from '../domain/incidents';

export function createIncidentUseCases(repository: IncidentRepository) {
  return {
    listIncidents: () => repository.list(),

    getIncident: (id: string) => {
      const normalizedId = id.trim();

      if (!normalizedId) {
        return Promise.resolve(null);
      }

      return repository.getById(normalizedId);
    },
  };
}