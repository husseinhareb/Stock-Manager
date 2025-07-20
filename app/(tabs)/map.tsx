import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { ClientPin, SavedClientSummary } from '../../src/db';
import {
  addClient,
  fetchClientItems,
  fetchClients,
  fetchSavedClients,
} from '../../src/db';
import { useTranslation } from 'react-i18next';

interface ClientItem {
  id: number;
  name: string;
  quantity: number;
  unitPrice: number;
}

export default function MapScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? 'light'];

  const [clients, setClients] = useState<ClientPin[]>([]);
  const [savedClients, setSavedClients] = useState<SavedClientSummary[]>([]);
  const [newPinCoord, setNewPinCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectModalVisible, setSelectModalVisible] = useState(false);
  const [detailModal, setDetailModal] = useState<{
    client: string;
    total: number;
    items: ClientItem[];
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [cls, clients] = await Promise.all([
        fetchClients(),
        fetchSavedClients(),
      ]);
      setClients(Array.isArray(cls) ? cls : []);
      setSavedClients(Array.isArray(clients) ? clients : []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('map.loadFailedTitle'), msg);
    }
  }, [t]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleMapLongPress = (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    setNewPinCoord(e.nativeEvent.coordinate);
    setSelectModalVisible(true);
  };

  const handleSelectClient = async (client: SavedClientSummary) => {
    if (!newPinCoord) return;
    try {
      await addClient(client.client, newPinCoord.latitude, newPinCoord.longitude);
      setSelectModalVisible(false);
      setNewPinCoord(null);
      await loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('map.errorSavingPinTitle'), msg);
    }
  };

  const handleViewClient = async (clientName: string) => {
    const client = savedClients.find(c => c.client === clientName);
    if (!client) {
      Alert.alert(
        t('map.clientNotFoundTitle'),
        t('map.clientNotFoundMessage', { client: clientName })
      );
      return;
    }
    try {
      const lines = await fetchClientItems(client.id);
      setDetailModal({
        client: client.client,
        total: client.total,
        items: lines.map(l => ({
          id: l.article_id,
          name: l.name,
          quantity: l.quantity,
          unitPrice: l.price,
        })),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('map.errorLoadingClientTitle'), msg);
    }
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
        },
      ]}
    >
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: -14.2350,
          longitude: -51.9253,
          latitudeDelta: 20,
          longitudeDelta: 20,
        }}
        onLongPress={handleMapLongPress}
      >
        {clients.map(pin => (
          <Marker
            key={pin.id}
            coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
            pinColor={theme.accent}
            title={pin.name}
            description={t('map.markerDescription')}
            onCalloutPress={() => handleViewClient(pin.name)}
          />
        ))}
      </MapView>

      {/* Select Client Modal */}
      <Modal visible={selectModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>  
            <Text style={[styles.modalTitle, { color: theme.primary }]}> {t('map.selectClientModalTitle')} </Text>
            <FlatList
              data={savedClients}
              keyExtractor={c => String(c.id)}
              renderItem={({ item }) => (
                <Pressable style={styles.modalItem} onPress={() => handleSelectClient(item)}>
                  <Text style={[styles.modalItemText, { color: theme.text }]}>                  
                    {`${item.client} ($${item.total.toFixed(2)})`}
                  </Text>
                </Pressable>
              )}
            />
            <Pressable style={styles.modalClose} onPress={() => setSelectModalVisible(false)}>
              <Text style={{ color: theme.accent }}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Client Detail Modal */}
      <Modal visible={!!detailModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>  
            <Text style={[styles.modalTitle, { color: theme.primary }]}>{detailModal?.client}</Text>
            <ScrollView style={styles.modalList}>
              {detailModal?.items.map((it, i) => (
                <View key={i} style={styles.detailRow}>
                  <Text style={[styles.cell, { color: theme.text }]}>{it.name}</Text>
                  <Text style={[styles.cell, { color: theme.text }]}>{it.quantity}</Text>
                  <Text style={[styles.cell, { color: theme.text }]}>{`$${it.unitPrice.toFixed(2)}`}</Text>
                  <Text style={[styles.cell, { color: theme.text }]}>{`$${(it.quantity * it.unitPrice).toFixed(2)}`}</Text>
                </View>
              ))}
            </ScrollView>
            <Pressable style={[styles.modalClose, { marginTop: 12 }]} onPress={() => setDetailModal(null)}>
              <Text style={{ color: theme.accent }}>{t('common.close')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map:       { flex: 1 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '85%',
    maxHeight: '70%',
    borderRadius: 10,
    padding: 16,
    elevation: 6,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
  },
  modalTitle: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  modalItem: { paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' },
  modalItemText: { fontSize: 16 },
  modalClose: { marginTop: 12, alignSelf: 'flex-end', padding: 8 },
  modalList: { marginVertical: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  cell: { flex: 1, textAlign: 'center', fontSize: 14 },
});
