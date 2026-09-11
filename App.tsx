import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import type { Incident } from './src/campusops/domain/incidents';
import { checkBackendHealth } from './src/campusops/app/health';
import { incidentUseCases } from './src/campusops/infrastructure/dependencies';

export default function App() {
  const [status, setStatus] = useState<'checking' | 'available' | 'offline'>('checking');
  const [incidents, setIncidents] = useState<readonly Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

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

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View accessibilityRole="summary" style={styles.header}>
        <Text style={styles.title}>CampusOps</Text>
        <Text style={styles.subtitle}>Incidencias del campus · datos sintéticos</Text>
        <Text testID="backend-status">Backend: {status}</Text>
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
});
