import { FakeIncidentRepository } from './fakeIncidentRepository';
import { createIncidentUseCases } from '../app/incidentUseCases';

export const incidentUseCases = createIncidentUseCases(new FakeIncidentRepository());
