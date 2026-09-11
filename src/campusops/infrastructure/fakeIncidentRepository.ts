import type { IncidentRepository, Incident } from '../domain/incidents';

const incidents: readonly Incident[] = [
  {
    id: 'INC-001',
    title: 'Falla de conectividad en laboratorio',
    description: 'La red de prueba no está disponible en los equipos del laboratorio 2.',
    category: 'connectivity',
    locationLabel: 'Edificio B, laboratorio 2',
    status: 'open',
  },
  {
    id: 'INC-002',
    title: 'Fuga de agua en pasillo',
    description: 'Se observa humedad junto a la entrada del edificio principal.',
    category: 'water',
    locationLabel: 'Edificio A, planta baja',
    status: 'assigned',
  },
  {
    id: 'INC-003',
    title: 'Equipo de proyección sin encender',
    description: 'El proyector del aula 14 no responde al control de encendido.',
    category: 'equipment',
    locationLabel: 'Edificio C, aula 14',
    status: 'in_progress',
  },
];

export class FakeIncidentRepository implements IncidentRepository {
  async list(): Promise<readonly Incident[]> {
    return incidents;
  }

  async getById(id: string): Promise<Incident | null> {
    return incidents.find((incident) => incident.id === id) ?? null;
  }
}
