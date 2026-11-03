import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import type { Incident } from './src/campusops/domain/incidents';
import type { IncidentLocation } from './src/campusops/contracts';
import { checkBackendHealth } from './src/campusops/application/health';
import { selectIncidentLocation } from './src/course-evaluation';
import { GeocodingError } from './src/api/locationClient';
import { incidentUseCases, locationClient, sessionManager } from './src/campusops/infrastructure/dependencies';

export default function App() {
  const [status, setStatus] = useState<'checking' | 'available' | 'offline'>('checking');
  const [incidents, setIncidents] = useState<readonly Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [sessionStatus, setSessionStatus] = useState(sessionManager.status);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [manualLocation, setManualLocation] = useState('Edificio de prueba A');
  const [selectedLocation, setSelectedLocation] = useState<IncidentLocation>(
    () => selectIncidentLocation(null, 'Edificio de prueba A'),
  );
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const locationRequestSequence = useRef(0);

  useEffect(() => {
    let active = true;
    void checkBackendHealth()
      .then(() => active && setStatus('available'))
      .catch(() => active && setStatus('offline'));
    void incidentUseCases
      .listIncidents()
      .then((loadedIncidents) => active && setIncidents(loadedIncidents));
    return () => {
      active = false;
    };
  }, []);

  const refreshSessionStatus = () => setSessionStatus(sessionManager.status);

  const login = async (actorId: string) => {
    setSessionError(null);
    setSessionStatus('authenticating');
    try {
      await sessionManager.login(actorId);
      refreshSessionStatus();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Error desconocido';
      setSessionError(`No se pudo iniciar la sesión: ${detail}`);
      refreshSessionStatus();
    }
  };

  const renewSession = async () => {
    setSessionError(null);
    setSessionStatus('refreshing');
    try {
      await sessionManager.withFreshToken(async (token) => token);
      refreshSessionStatus();
    } catch {
      setSessionError('La renovación falló; la sesión volvió a estado no autenticado.');
      refreshSessionStatus();
    }
  };

  const logout = async () => {
    await sessionManager.logout();
    setSessionError(null);
    refreshSessionStatus();
  };

  const findIncidentLocation = async () => {
    if (!manualLocation.trim()) {
      setSelectedLocation(selectIncidentLocation(null, ''));
      setLocationStatus('Escribe un edificio, zona o referencia para continuar.');
      return;
    }

    const requestId = ++locationRequestSequence.current;
    const requestedLabel = manualLocation.trim();
    setLocationLoading(true);
    setLocationStatus(null);
    try {
      const providerResult = await locationClient.geocode(requestedLabel);
      if (requestId !== locationRequestSequence.current) return;
      const selected = selectIncidentLocation(providerResult, requestedLabel);
      setSelectedLocation(selected);
      setLocationStatus(selected.source === 'provider'
        ? 'Se encontró una ubicación del proveedor; también puedes conservar el texto manual.'
        : 'La respuesta no contiene una ubicación válida. Puedes continuar con el texto manual.');
    } catch (error) {
      if (requestId !== locationRequestSequence.current) return;
      setSelectedLocation(selectIncidentLocation(null, requestedLabel));
      const reason = error instanceof GeocodingError && error.kind === 'timeout'
        ? 'La búsqueda agotó el tiempo de espera.'
        : error instanceof GeocodingError && error.status === 429
          ? 'El proveedor limitó la búsqueda (HTTP 429).'
          : 'El servicio de ubicación no está disponible.';
      setLocationStatus(`${reason} Puedes continuar con el edificio, zona o referencia manual.`);
    } finally {
      if (requestId === locationRequestSequence.current) setLocationLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View accessibilityRole="summary" style={styles.header}>
        <Text style={styles.title}>CampusOps</Text>
        <Text style={styles.subtitle}>Incidencias del campus · datos sintéticos</Text>
        <Text testID="backend-status">Backend: {status}</Text>
      </View>
      <View style={styles.panel} testID="session-panel">
        <Text style={styles.sectionTitle}>Sesión</Text>
        <Text testID="session-status">Estado: {sessionStatus}</Text>
        {sessionManager.current ? (
          <>
            <View style={styles.infoCard}>
              <Text style={styles.cardLabel}>Sesión activa</Text>
              <Text style={styles.cardValue}>{sessionManager.current.actorId}</Text>
              <Text>Perfil: {sessionManager.current.role}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => void renewSession()}
              style={[styles.actionCard, styles.renewCard]}
            >
              <Text style={styles.cardTitle}>Renovar sesión</Text>
              <Text style={styles.cardDescription}>Actualizar el token de acceso</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void logout()}
              style={[styles.actionCard, styles.logoutCard]}
            >
              <Text style={styles.cardTitle}>Cerrar sesión</Text>
              <Text style={styles.cardDescription}>Borrar la sesión actual</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.instruction}>Selecciona un perfil para iniciar:</Text>
            <View style={styles.cardsGrid}>
              <Pressable
                accessibilityRole="button"
                onPress={() => void login('reporter-1')}
                style={[styles.profileCard, styles.reporterCard]}
              >
                <Ionicons name="person-outline" size={28} color="#1e2c35" />
                <Text style={styles.cardTitle}>Reportante</Text>
                <Text style={styles.cardDescription}>Crear y consultar incidencias</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void login('technician-1')}
                style={[styles.profileCard, styles.technicianCard]}
              >
                <Ionicons name="construct-outline" size={28} color="#1e2c35" />
                <Text style={styles.cardTitle}>Técnico</Text>
                <Text style={styles.cardDescription}>Atender incidencias asignadas</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void login('coordinator-1')}
                style={[styles.profileCard, styles.coordinatorCard]}
              >
                <Ionicons name="clipboard-outline" size={28} color="#1e2c35" />
                <Text style={styles.cardTitle}>Coordinación</Text>
                <Text style={styles.cardDescription}>Supervisar y cerrar incidencias</Text>
              </Pressable>
            </View>
          </>
        )}
        {sessionError ? <Text accessibilityRole="alert">{sessionError}</Text> : null}
      </View>
      <View style={styles.panel} testID="location-panel">
        <Text style={styles.sectionTitle}>Ubicación del incidente</Text>
        <Text>Busca una coincidencia o conserva una ubicación escrita manualmente.</Text>
        <Text style={styles.detail}>
          {locationClient.provider === 'open-meteo'
            ? 'Proveedor: Open-Meteo Geocoding API (atribución CC BY 4.0).'
            : 'Proveedor: doble de geocodificación local CampusOps.'}
        </Text>
        <TextInput
          accessibilityLabel="Edificio, zona o referencia"
          testID="manual-location-input"
          value={manualLocation}
          onChangeText={(value) => {
            locationRequestSequence.current += 1;
            setManualLocation(value);
            setSelectedLocation(selectIncidentLocation(null, value));
            setLocationStatus('La ubicación manual está disponible sin coordenadas.');
            setLocationLoading(false);
          }}
          placeholder="Edificio, zona o referencia"
          style={styles.locationInput}
        />
        <Pressable
          accessibilityRole="button"
          testID="geocode-location-button"
          disabled={locationLoading}
          onPress={() => void findIncidentLocation()}
          style={[styles.actionCard, styles.locationButton]}
        >
          <Text style={styles.cardTitle}>{locationLoading ? 'Buscando ubicación...' : 'Consultar geocodificación'}</Text>
        </Pressable>
        {locationStatus ? <Text accessibilityRole="alert" testID="location-status">{locationStatus}</Text> : null}
        <Text testID="selected-location">
          Ubicación seleccionada ({selectedLocation.source}): {selectedLocation.label}
        </Text>
        {selectedLocation.source === 'provider' ? (
          <Text style={styles.detail}>
            Coordenadas recibidas del proveedor: {selectedLocation.latitude}, {selectedLocation.longitude}
          </Text>
        ) : (
          <Text style={styles.detail}>Ubicación textual; no se asignaron coordenadas.</Text>
        )}
      </View>
      {selectedIncident ? (
        <View style={styles.panel}>
          <Pressable accessibilityRole="button" onPress={() => setSelectedIncident(null)}>
            <Text style={styles.back}>Volver a incidencias</Text>
          </Pressable>
          <Text style={styles.sectionTitle}>{selectedIncident.title}</Text>
          <Text>{selectedIncident.description}</Text>
          <Text style={styles.detail}>Categoría: {selectedIncident.category}</Text>
          <Text style={styles.detail}>Ubicación: {selectedIncident.locationLabel}</Text>
          <Text style={styles.detail}>Estado: {selectedIncident.status}</Text>
        </View>
      ) : (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Incidencias</Text>
          {incidents.map((incident) => (
            <Pressable
              accessibilityRole="button"
              key={incident.id}
              onPress={() => void incidentUseCases.getIncident(incident.id).then(setSelectedIncident)}
              style={styles.incident}
            >
              <Text style={styles.incidentTitle}>{incident.title}</Text>
              <Text>{incident.locationLabel}</Text>
              <Text style={styles.detail}>Estado: {incident.status}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, gap: 16, padding: 24 },
  header: { gap: 8, paddingTop: 24 },
  panel: { gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '700' },
  incident: { gap: 4, borderWidth: 1, borderColor: '#9aa8b2', padding: 16 },
  incidentTitle: { fontSize: 16, fontWeight: '600' },
  detail: { color: '#40515c' },
  back: { color: '#1f5f8b', fontWeight: '600' },
  instruction: { fontSize: 15, color: '#40515c' },
  cardsGrid: { gap: 10 },
  profileCard: { borderRadius: 12, borderWidth: 2, gap: 6, padding: 16 },
  reporterCard: { backgroundColor: '#eaf4ff', borderColor: '#72aee6' },
  technicianCard: { backgroundColor: '#edf9f0', borderColor: '#72bd83' },
  coordinatorCard: { backgroundColor: '#fff7e6', borderColor: '#e5b85c' },
  infoCard: { backgroundColor: '#eef2f5', borderRadius: 12, gap: 5, padding: 16 },
  actionCard: { borderRadius: 12, borderWidth: 2, gap: 4, padding: 16 },
  locationInput: { borderColor: '#9aa8b2', borderRadius: 8, borderWidth: 1, padding: 12 },
  locationButton: { backgroundColor: '#eaf4ff', borderColor: '#72aee6' },
  renewCard: { backgroundColor: '#eaf4ff', borderColor: '#72aee6' },
  logoutCard: { backgroundColor: '#fff0f0', borderColor: '#df8585' },
  cardLabel: { color: '#40515c', fontSize: 13, fontWeight: '600' },
  cardTitle: { color: '#1e2c35', fontSize: 17, fontWeight: '700' },
  cardValue: { color: '#1e2c35', fontSize: 16, fontWeight: '600' },
  cardDescription: { color: '#40515c', fontSize: 13 },
});