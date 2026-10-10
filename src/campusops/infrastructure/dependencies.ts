import { Platform } from 'react-native';
import { IncidentCloudClient } from '../../api/incidentCloudClient';
import { CampusSessionManager } from '../../api/sessionManager';
import { FakeIncidentRepository } from './fakeIncidentRepository';
import { createIncidentUseCases } from '../application/incidentUseCases';

const defaultBackendUrl = Platform.OS === 'android'
	? 'http://10.0.2.2:4310'
	: 'http://127.0.0.1:4310';

export const sessionManager = new CampusSessionManager({
	baseUrl: process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ?? defaultBackendUrl,
});

const repository = process.env.EXPO_PUBLIC_USE_CLOUD === 'true'
	? new IncidentCloudClient({ sessionManager })
	: new FakeIncidentRepository();

export const incidentUseCases = createIncidentUseCases(repository);
