// app/(tabs)/map.tsx
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,

  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { ClientPin, SavedClientSummary } from '../../src/db';
import {
  addClient,
  deleteClient,
  fetchClientItems,
  fetchClients,
  fetchSavedClients,
  getSetting,
} from '../../src/db';

type ClientItem = { id: number; name: string; quantity: number; unitPrice: number };

const MAPTILER_KEY =
  process.env.EXPO_PUBLIC_MAPTILER_KEY ||
  // optional fallback if you also put it in app.json → expo.extra.MAPTILER_KEY
  (require('expo-constants').default.expoConfig?.extra?.MAPTILER_KEY ?? '');

export default function MapScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? 'light'];

  // Currency
  const [currencySymbol, setCurrencySymbol] = useState('$');
  useEffect(() => {
    (async () => {
      try {
        const code = await getSetting('currency', 'USD');
        const symbols: Record<string, string> = {
          USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$',
          CHF: 'CHF', CNY: '¥', BRL: 'R$',
        };
        setCurrencySymbol(symbols[code] ?? '$');
      } catch (e) { console.warn(e); }
    })();
  }, []);

  // Data
  const [clients, setClients] = useState<ClientPin[]>([]);
  const [savedClients, setSavedClients] = useState<SavedClientSummary[]>([]);
  const [newPinCoord, setNewPinCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectModalVisible, setSelectModalVisible] = useState(false);
  const [detailModal, setDetailModal] = useState<{
    pinId: number; client: string; total: number; items: ClientItem[];
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [cls, sc] = await Promise.all([fetchClients(), fetchSavedClients()]);
      setClients(Array.isArray(cls) ? cls : []);
      setSavedClients(Array.isArray(sc) ? sc : []);
    } catch (e: any) {
      Alert.alert(t('map.loadFailedTitle'), e.message || String(e));
    }
  }, [t]);
  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // ------ WebView (Leaflet) bridge ------
  const webRef = useRef<WebView>(null);

  // send markers to WebView whenever client pins change
  useEffect(() => {
    const markers = clients.map(p => ({
      id: p.id, name: p.name, latitude: p.latitude, longitude: p.longitude
    }));
    const js = `window.__setMarkers && window.__setMarkers(${JSON.stringify(markers)}); true;`;
    webRef.current?.injectJavaScript(js);
  }, [clients]);

  // handle messages coming from WebView (long press & marker click)
  const onWebMessage = (ev: any) => {
    try {
      const msg = JSON.parse(ev.nativeEvent.data);
      if (msg.type === 'longPress') {
        setNewPinCoord({ latitude: msg.lat, longitude: msg.lng });
        setSelectModalVisible(true);
      } else if (msg.type === 'markerPress') {
        const pin = clients.find(c => c.id === msg.id);
        if (pin) handleViewClient(pin);
      }
    } catch { }
  };

  const handleSelectClient = async (client: SavedClientSummary) => {
    if (!newPinCoord) return;
    try {
      await addClient(client.client, newPinCoord.latitude, newPinCoord.longitude);
      setSelectModalVisible(false);
      setNewPinCoord(null);
      await loadData();
    } catch (e: any) {
      Alert.alert(t('map.errorSavingPinTitle'), e.message || String(e));
    }
  };

  const handleViewClient = async (pin: ClientPin) => {
    const summary = savedClients.find(s => s.client === pin.name);
    if (!summary) {
      return Alert.alert(
        t('map.clientNotFoundTitle'),
        t('map.clientNotFoundMessage', { client: pin.name })
      );
    }
    try {
      const lines = await fetchClientItems(summary.id);
      setDetailModal({
        pinId: pin.id,
        client: summary.client,
        total: summary.total,
        items: lines.map(l => ({
          id: l.article_id, name: l.name, quantity: l.quantity, unitPrice: l.price
        })),
      });
    } catch (e: any) {
      Alert.alert(t('map.errorLoadingClientTitle'), e.message || String(e));
    }
  };

  const confirmDeletePin = (pinId: number) => {
    Alert.alert(
      t('map.confirmDeleteTitle'),
      t('map.confirmDeleteMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'), style: 'destructive',
          onPress: async () => {
            try { await deleteClient(pinId); setDetailModal(null); await loadData(); }
            catch (e: any) { Alert.alert(t('map.errorDeletingPinTitle'), e.message || String(e)); }
          }
        }
      ]
    );
  };

  const html = useMemo(() => {
    // Leaflet + MapTiler raster (free tier). Attribution required.
    // Long-press detection: single finger, no drag/zoom, 500ms hold.
    return `
  <!doctype html><html><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height:100%; margin:0; padding:0; }
    .marker-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
  .marker-icon { width:28px; height:28px; display:block; border-radius:6px; background: linear-gradient(180deg,#34d399,#059669); box-shadow: 0 6px 14px rgba(3,7,18,0.32); display:flex; align-items:center; justify-content:center; }
  .marker-icon svg { width:16px; height:16px; }
  .marker-label { position: absolute; top: 36px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.72); color: #fff; padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; white-space: nowrap; pointer-events: none; box-shadow: 0 6px 18px rgba(2,6,23,0.28); }
    .marker-label::after { content: ''; position: absolute; left: 50%; transform: translateX(-50%); top: calc(100% + 4px); width: 10px; height: 6px; background: rgba(0,0,0,0.72); clip-path: polygon(50% 0, 0 100%, 100% 100%); }
  </style>
  </head><body>
  <div id="map"></div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const RN = window.ReactNativeWebView;

    const map = L.map('map', { zoomControl: true, attributionControl: true })
      .setView([-14.2350, -51.9253], 4);

    // MapTiler tiles (free tier)
    const key = ${JSON.stringify(MAPTILER_KEY || "")};
    const url = key
      ? \`https://api.maptiler.com/maps/streets/{z}/{x}/{y}@2x.png?key=\${key}\`
      : 'https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=__MISSING__';
    L.tileLayer(url, {
      maxZoom: 20, tileSize: 512, zoomOffset: -1,
      attribution: '&copy; MapTiler &copy; OpenStreetMap contributors'
    }).addTo(map);

    // ---------- Robust long-press: single finger + no movement ----------
    const LONG_PRESS_MS = 500;   // hold duration
    const MOVE_TOLERANCE = 10;   // px of allowed jitter

    let pressTimer = null;
    let startPt = null;          // container point captured at start
    let mouseDown = false;

    function clearPress() {
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = null;
      startPt = null;
      mouseDown = false;
    }

    function scheduleLongPress(latlngGetter) {
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        if (!startPt) return;
        const latlng = latlngGetter();
        if (!latlng) return;
        RN && RN.postMessage(JSON.stringify({ type:'longPress', lat: latlng.lat, lng: latlng.lng }));
        clearPress();
      }, LONG_PRESS_MS);
    }

    // ---- Touch handlers (mobile) ----
    function onTouchStart(e) {
      if (!e.touches || e.touches.length !== 1) { // multi-touch (pinch) -> cancel
        clearPress();
        return;
      }
      const t = e.touches[0];
      startPt = map.mouseEventToContainerPoint(t);
      scheduleLongPress(() => map.containerPointToLatLng(startPt));
    }

    function onTouchMove(e) {
      if (!pressTimer) return;
      if (!e.touches || e.touches.length !== 1) { clearPress(); return; }
      const t = e.touches[0];
      const pt = map.mouseEventToContainerPoint(t);
      const dx = pt.x - startPt.x, dy = pt.y - startPt.y;
      if (Math.hypot(dx, dy) > MOVE_TOLERANCE) clearPress(); // user is panning
    }

    function onTouchEnd() { clearPress(); }
    function onTouchCancel() { clearPress(); }

    // ---- Mouse handlers (optional; for simulators/desktops) ----
    function onMouseDown(e) {
      mouseDown = true;
      startPt = map.mouseEventToContainerPoint(e);
      scheduleLongPress(() => map.containerPointToLatLng(startPt));
    }
    function onMouseMove(e) {
      if (!mouseDown || !pressTimer) return;
      const pt = map.mouseEventToContainerPoint(e);
      const dx = pt.x - startPt.x, dy = pt.y - startPt.y;
      if (Math.hypot(dx, dy) > MOVE_TOLERANCE) clearPress();
    }
    function onMouseUp() { clearPress(); }
    function onMouseLeave() { clearPress(); }

    // Extra safety: cancel if Leaflet starts moving/zooming
    map.on('dragstart zoomstart movestart', clearPress);

    // Attach listeners
    const el = document.getElementById('map');
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });

    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('mousemove', onMouseMove);
    el.addEventListener('mouseup', onMouseUp);
    el.addEventListener('mouseleave', onMouseLeave);

    // ---------- Markers bridge (styled divIcons with labels) ----------
    let layer = L.layerGroup().addTo(map);
    function escapeHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function setMarkers(list) {
      layer.clearLayers();
      (list || []).forEach(m => {
    const safeName = escapeHtml(m.name || '');
    const markHtml = '<div class="marker-wrap">'
      + '<div class="marker-icon">'
          + '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'
            + '<path fill="#ffffff" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>'
          + '</svg>'
        + '</div>'
      + '<div class="marker-label">' + safeName + '</div>'
    + '</div>';
    const icon = L.divIcon({ className: '', html: markHtml, iconSize: [140, 70], iconAnchor: [70, 18] });
        const marker = L.marker([m.latitude, m.longitude], { icon });
        marker.on('click', () => RN && RN.postMessage(JSON.stringify({ type:'markerPress', id: m.id })));
        marker.addTo(layer);
      });
    }
    window.__setMarkers = setMarkers;
  </script>
  </body></html>
  `;
  }, []);

  return (
    <SafeAreaView edges={["left", "right"]} style={[styles.container, { backgroundColor: theme.background }]}> 
      <WebView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        onMessage={onWebMessage}
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled
      />

      {/* Attribution is rendered by Leaflet inside the WebView; removed duplicate native overlay */}

      {/* Select Client Modal */}
      <Modal visible={selectModalVisible} transparent animationType="slide" onRequestClose={() => setSelectModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
            <Text style={[styles.modalTitle, { color: theme.primary }]}>{t('map.selectClientModalTitle')}</Text>
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
                    { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.6 : 1 }
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
      <Modal visible={!!detailModal} transparent animationType="fade" onRequestClose={() => setDetailModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
                <View style={styles.receiptHeader}>
                  <Text style={[styles.receiptTitle, { color: theme.primary }]}>{detailModal?.client}</Text>
                  <Text style={[styles.receiptMeta, { color: theme.placeholder }]}>{new Date().toLocaleString()}</Text>
                </View>

                <ScrollView style={[styles.modalList, styles.receiptBody]}>
                  <View style={styles.receiptColumnsHeader}>
                    <Text style={[styles.colName, { color: theme.placeholder }]}>Item</Text>
                    <Text style={[styles.colQty, { color: theme.placeholder }]}>Qty</Text>
                    <Text style={[styles.colPrice, { color: theme.placeholder }]}>Unit</Text>
                    <Text style={[styles.colTotal, { color: theme.placeholder }]}>Line</Text>
                  </View>

                  {detailModal?.items.map((it, i) => (
                    <View key={i} style={[styles.receiptRow, i % 2 === 0 ? styles.receiptRowAlt : undefined]}>
                      <Text style={[styles.colName, { color: theme.text }]} numberOfLines={2}>{it.name}</Text>
                      <Text style={[styles.colQty, { color: theme.text }]}>{String(it.quantity)}</Text>
                      <Text style={[styles.colPrice, { color: theme.text }]}>{`${currencySymbol}${it.unitPrice.toFixed(2)}`}</Text>
                      <Text style={[styles.colTotal, { color: theme.text }]}>{`${currencySymbol}${(it.quantity * it.unitPrice).toFixed(2)}`}</Text>
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.receiptFooter}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingBottom: 8 }}>
                    <Text style={[styles.receiptFooterLabel, { color: theme.text }]}>Subtotal</Text>
                    <Text style={[styles.receiptFooterValue, { color: theme.text }]}>{detailModal ? `${currencySymbol}${detailModal.total.toFixed(2)}` : ''}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                    <Text style={[styles.receiptTotalLabel, { color: theme.primary }]}>Total</Text>
                    <Text style={[styles.receiptTotalValue, { color: theme.primary }]}>{detailModal ? `${currencySymbol}${detailModal.total.toFixed(2)}` : ''}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
                  <Pressable style={[styles.modalClose, { marginRight: 8 }]} onPress={() => detailModal && confirmDeletePin(detailModal.pinId)}>
                    <Text style={{ color: theme.accent }}>{t('map.deletePin')}</Text>
                  </Pressable>
                  <Pressable style={styles.modalClose} onPress={() => setDetailModal(null)}>
                    <Text style={{ color: theme.accent }}>{t('common.close')}</Text>
                  </Pressable>
                </View>
              </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Root
  container: { flex: 1 },

  // Map attribution pill
  attribution: {
    position: "absolute",
    right: 12,
    bottom: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  attrText: { fontSize: 11, fontWeight: "600", opacity: 0.9 },

  // -------- Modals (shared) --------
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modal: {
    width: "92%",
    maxWidth: 520,
    maxHeight: "78%",
    borderRadius: 12,
    padding: 22,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 14,
    letterSpacing: 0.2,
  },

  // ----- Select Client Modal (list of saved clients to pin) -----
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 4,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  modalItemText: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  modalClose: {
    alignSelf: "flex-end",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
  },

  // ----- Client Detail Modal (bought articles) -----
  // Scrollable list container with nice frame
  modalList: {
    maxHeight: 380,
    marginTop: 4,
    marginBottom: 12,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  // Row styling similar to client.tsx
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Optional alt background (apply if you later alternate rows)
  detailRowAlt: {
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  // Generic cell used in this file (kept same key, upgraded look)
  cell: {
    flex: 1,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  // Receipt styles
  receiptHeader: { alignItems: 'center', marginBottom: 8 },
  receiptTitle: { fontSize: 18, fontWeight: '900', letterSpacing: 0.3 },
  receiptMeta: { fontSize: 12, marginTop: 6, opacity: 0.9 },
  receiptBody: { maxHeight: 320, backgroundColor: 'transparent' },
  receiptColumnsHeader: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  receiptRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  receiptRowAlt: { backgroundColor: 'rgba(0,0,0,0.02)' },
  colName: { flex: 1.6, fontSize: 14, fontWeight: '700' },
  colQty: { width: 48, textAlign: 'center', fontWeight: '800' },
  colPrice: { width: 84, textAlign: 'right', fontWeight: '700' },
  colTotal: { width: 92, textAlign: 'right', fontWeight: '900', marginLeft: 12 },
  receiptFooter: { paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  receiptFooterLabel: { fontSize: 14, fontWeight: '700' },
  receiptFooterValue: { fontSize: 14, fontWeight: '700' },
  receiptTotalLabel: { fontSize: 16, fontWeight: '900' },
  receiptTotalValue: { fontSize: 18, fontWeight: '900' },

  // (Optional) If you later decide to split columns like in client.tsx:
  // detailItem: { flex: 1, fontSize: 16, fontWeight: "600" },
  // detailQty:  { width: 44, textAlign: "center", fontWeight: "700" },
  // detailPrice:{ width: 76, textAlign: "right",  fontWeight: "700" },
  // detailTotal:{ width: 86, textAlign: "right",  marginLeft: 12, fontWeight: "800" },
});