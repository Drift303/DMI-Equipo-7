import { FakeIncidentRepository } from './fakeIncidentRepository';
import { createIncidentUseCases } from '../application/incidentUseCases';

export const incidentUseCases = createIncidentUseCases(new FakeIncidentRepository());
