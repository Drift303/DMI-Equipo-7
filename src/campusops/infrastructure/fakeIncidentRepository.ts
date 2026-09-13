import {
  isValidIncident,
  type Incident,
  type IncidentRepository,
} from '../domain/incidents';

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
  {
    id: 'INC-004',
    title: 'Luz de emergencia agotada',
    description: 'La luminaria de emergencia del acceso norte requiere reemplazo.',
    category: 'safety',
    locationLabel: 'Edificio D, acceso norte',
    status: 'resolved',
  },
];

function requireValidFixtures(items: readonly Incident[]): readonly Incident[] {
  if (!items.every(isValidIncident)) {
    throw new Error('Fake incident fixtures must satisfy the Incident domain model.');
  }
  return items;
}

const validIncidents = requireValidFixtures(incidents);

export class FakeIncidentRepository implements IncidentRepository {
  async list(): Promise<readonly Incident[]> {
    return validIncidents;
  }

  async getById(id: string): Promise<Incident | null> {
    const normalizedId = id.trim();
    if (normalizedId.length === 0) {
      return null;
    }

    return validIncidents.find((incident) => incident.id === normalizedId) ?? null;
  }
}
