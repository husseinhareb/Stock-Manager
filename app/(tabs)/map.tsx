// app/(tabs)/map.tsx
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import type { LatLng } from 'react-native-maps';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { ClientPin, SavedClientSummary } from '../../src/db';
import {
  addClient,
  deleteClient,
  fetchClientItems,
  fetchClients,
  fetchSavedClients,
  getSetting,
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

  // --- Currency setting ---
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const SYMBOLS: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£',
    JPY: '¥', CAD: 'C$', AUD: 'A$',
    CHF: 'CHF', CNY: '¥', BRL: 'R$',
  };

  useEffect(() => {
    (async () => {
      try {
        const code = await getSetting('currency', 'USD');
        setCurrencyCode(code);
        setCurrencySymbol(SYMBOLS[code] ?? '$');
      } catch (e) {
        console.error('Failed to load currency setting:', e);
      }
    })();
  }, []);

  // --- Data state ---
  const [clients, setClients] = useState<ClientPin[]>([]);
  const [savedClients, setSavedClients] = useState<SavedClientSummary[]>([]);
  const [newPinCoord, setNewPinCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectModalVisible, setSelectModalVisible] = useState(false);
  const [detailModal, setDetailModal] = useState<{
    pinId: number;
    client: string;
    total: number;
    items: ClientItem[];
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [cls, sc] = await Promise.all([fetchClients(), fetchSavedClients()]);
      setClients(Array.isArray(cls) ? cls : []);
      setSavedClients(Array.isArray(sc) ? sc : []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('map.loadFailedTitle'), msg);
    }
  }, [t]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // --- Handlers ---
  const handleMapLongPress = (e: { nativeEvent: { coordinate: LatLng } }) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setNewPinCoord({ latitude, longitude });
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

  const handleViewClient = async (pin: ClientPin) => {
    const summary = savedClients.find(s => s.client === pin.name);
    if (!summary) {
      Alert.alert(
        t('map.clientNotFoundTitle'),
        t('map.clientNotFoundMessage', { client: pin.name })
      );
      return;
    }
    try {
      const lines = await fetchClientItems(summary.id);
      setDetailModal({
        pinId: pin.id,
        client: summary.client,
        total: summary.total,
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

  const confirmDeletePin = (pinId: number) => {
    Alert.alert(
      t('map.confirmDeleteTitle'),
      t('map.confirmDeleteMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteClient(pinId);
              setDetailModal(null);
              await loadData();
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              Alert.alert(t('map.errorDeletingPinTitle'), msg);
            }
          }
        }
      ]
    );
  };

  const markers = useMemo(
    () =>
      clients.map(pin => (
        <Marker
          key={`pin-${pin.id}`}
          coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
          onPress={() => handleViewClient(pin)}
        >
          <View style={[styles.markerDot, { backgroundColor: theme.accent, borderColor: '#fff' }]} />
        </Marker>
      )),
    [clients, theme.accent]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.map as StyleProp<ViewStyle>}>
        <MapView
          style={StyleSheet.absoluteFill}
          // show only raster tiles to mimic your previous "blank + raster" style
          mapType="none"
          initialRegion={{
            latitude: -14.2350,
            longitude: -51.9253,
            latitudeDelta: 30,     // zoom-ish
            longitudeDelta: 30,
          }}
          onLongPress={handleMapLongPress}
        >
          {/* OSM tiles */}
          <UrlTile
            urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maximumZ={19}
            flipY={false}
            tileSize={256}
            zIndex={0}
          />

          {markers}
        </MapView>
      </View>

      <View style={[styles.attributionContainer, { backgroundColor: 'rgba(255,255,255,0.7)' }]}>
        <Text style={styles.attributionText}>
          © OpenStreetMap contributors
        </Text>
      </View>

      {/* Select Client Modal */}
      <Modal
        visible={selectModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
            <Text style={[styles.modalTitle, { color: theme.primary }]}>
              {t('map.selectClientModalTitle')}
            </Text>
            <FlatList
              data={savedClients}
              keyExtractor={c => String(c.id)}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              contentContainerStyle={{ paddingVertical: 8 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handleSelectClient(item)}
                  style={({ pressed }) => [
                    styles.modalItem,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                      opacity: pressed ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.modalItemText, { color: theme.text }]}>
                    {`${item.client} – ${currencySymbol}${item.total.toFixed(2)}`}
                  </Text>
                </Pressable>
              )}
            />
            <Pressable style={styles.modalClose} onPress={() => setSelectModalVisible(false)}>
              <Text style={{ color: theme.accent, fontWeight: '600' }}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Client Detail Modal */}
      <Modal
        visible={!!detailModal}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
            <Text style={[styles.modalTitle, { color: theme.primary }]}>
              {detailModal?.client}
            </Text>
            <ScrollView style={styles.modalList}>
              {detailModal?.items.map((it, i) => (
                <View key={i} style={styles.detailRow}>
                  <Text style={[styles.cell, { color: theme.text }]}>{it.name}</Text>
                  <Text style={[styles.cell, { color: theme.text }]}>{it.quantity}</Text>
                  <Text style={[styles.cell, { color: theme.text }]}>{`${currencySymbol}${it.unitPrice.toFixed(2)}`}</Text>
                  <Text style={[styles.cell, { color: theme.text }]}>{`${currencySymbol}${(it.quantity * it.unitPrice).toFixed(2)}`}</Text>
                </View>
              ))}
            </ScrollView>
            <Pressable
              style={[styles.modalClose, { marginTop: 12 }]}
              onPress={() => detailModal && confirmDeletePin(detailModal.pinId)}
            >
              <Text style={{ color: theme.accent }}>{t('map.deletePin')}</Text>
            </Pressable>
            <Pressable style={[styles.modalClose, { marginTop: 8 }]} onPress={() => setDetailModal(null)}>
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
  map: { flex: 1 },

  markerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },

  attributionContainer: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  attributionText: { fontSize: 10, color: '#333' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '85%',
    maxHeight: '70%',
    borderRadius: 12,
    padding: 16,
    elevation: 6,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
  },
  modalTitle: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  modalItem: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1 },
  modalItemText: { fontSize: 16 },
  modalClose: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 12, marginTop: 12 },
  modalList: { marginVertical: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  cell: { flex: 1, textAlign: 'center', fontSize: 14 },
});
