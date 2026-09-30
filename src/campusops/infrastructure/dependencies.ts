import { IncidentCloudClient } from '../../api/incidentCloudClient';
import { FakeIncidentRepository } from './fakeIncidentRepository';
import { createIncidentUseCases } from '../application/incidentUseCases';

const repository = process.env.EXPO_PUBLIC_USE_CLOUD === 'true'
	? new IncidentCloudClient()
	: new FakeIncidentRepository();

export const incidentUseCases = createIncidentUseCases(repository);
