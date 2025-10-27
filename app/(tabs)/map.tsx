// app/(tabs)/map.tsx
import { Colors } from '@constants/Colors';
import { FontAwesome } from '@expo/vector-icons';
import { useColorScheme } from '@hooks/useColorScheme';
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
  const [isWebViewLoaded, setIsWebViewLoaded] = useState(false);

  // send markers to WebView whenever client pins change (but only after WebView is loaded)
  useEffect(() => {
    if (!isWebViewLoaded) return; // Wait for WebView to be ready
    
    const markers = clients.map(p => ({
      id: p.id, name: p.name, latitude: p.latitude, longitude: p.longitude
    }));
    const js = `window.__setMarkers && window.__setMarkers(${JSON.stringify(markers)}); true;`;
    webRef.current?.injectJavaScript(js);
  }, [clients, isWebViewLoaded]);

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
    .marker-wrap { 
      position: relative; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      cursor: pointer;
    }
    .marker-icon { 
      width: 40px; 
      height: 40px; 
      display: flex; 
      align-items: center; 
      justify-content: center;
      border-radius: 50% 50% 50% 0;
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1e40af 100%);
      box-shadow: 
        0 8px 16px rgba(37, 99, 235, 0.4),
        0 4px 8px rgba(30, 64, 175, 0.3),
        inset 0 -2px 4px rgba(0, 0, 0, 0.2),
        inset 0 2px 4px rgba(255, 255, 255, 0.3);
      border: 3px solid #ffffff;
      transform: rotate(-45deg);
      position: relative;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .marker-icon::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 14px;
      height: 14px;
      background: #ffffff;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    }
    .marker-icon svg { 
      width: 20px; 
      height: 20px; 
      transform: rotate(45deg);
      position: relative;
      z-index: 1;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    }
    .marker-wrap:hover .marker-icon {
      transform: rotate(-45deg) scale(1.15);
      box-shadow: 
        0 12px 24px rgba(37, 99, 235, 0.5),
        0 6px 12px rgba(30, 64, 175, 0.4),
        inset 0 -2px 4px rgba(0, 0, 0, 0.2),
        inset 0 2px 4px rgba(255, 255, 255, 0.3),
        0 0 20px rgba(59, 130, 246, 0.6);
    }
    .marker-label { 
      position: absolute; 
      top: 48px; 
      left: 50%; 
      transform: translateX(-50%);
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%);
      color: #ffffff; 
      padding: 8px 14px; 
      border-radius: 12px; 
      font-size: 13px; 
      font-weight: 700; 
      white-space: nowrap; 
      pointer-events: none; 
      box-shadow: 
        0 8px 24px rgba(0, 0, 0, 0.4),
        0 4px 12px rgba(0, 0, 0, 0.3),
        inset 0 1px 2px rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.15);
      letter-spacing: 0.3px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .marker-wrap:hover .marker-label {
      transform: translateX(-50%) translateY(-4px);
      box-shadow: 
        0 12px 32px rgba(0, 0, 0, 0.5),
        0 6px 16px rgba(0, 0, 0, 0.4),
        inset 0 1px 2px rgba(255, 255, 255, 0.15);
    }
    .marker-label::before { 
      content: ''; 
      position: absolute; 
      left: 50%; 
      transform: translateX(-50%); 
      top: -6px; 
      width: 0; 
      height: 0; 
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-bottom: 8px solid rgba(30, 41, 59, 0.95);
      filter: drop-shadow(0 -2px 4px rgba(0, 0, 0, 0.2));
    }
    /* Pulse animation for newly added pins */
    @keyframes pulse-ring {
      0% { transform: scale(0.8); opacity: 1; }
      100% { transform: scale(2.5); opacity: 0; }
    }
    .marker-icon.pulse::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: rgba(59, 130, 246, 0.4);
      animation: pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
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
            + '<path fill="#ffffff" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>'
          + '</svg>'
        + '</div>'
      + '<div class="marker-label">' + safeName + '</div>'
    + '</div>';
    const icon = L.divIcon({ className: '', html: markHtml, iconSize: [160, 90], iconAnchor: [80, 40] });
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
        onLoad={() => {
          setIsWebViewLoaded(true);
          // Send initial markers after WebView loads
          const markers = clients.map(p => ({
            id: p.id, name: p.name, latitude: p.latitude, longitude: p.longitude
          }));
          const js = `window.__setMarkers && window.__setMarkers(${JSON.stringify(markers)}); true;`;
          webRef.current?.injectJavaScript(js);
        }}
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
      <Modal visible={!!detailModal} transparent animationType="slide" onRequestClose={() => setDetailModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.receiptPaper}>
              {/* Receipt Header - Store/Business Info */}
              <View style={styles.receiptHeader}>
                <FontAwesome name="shopping-bag" size={28} color="#2c3e50" />
                <Text style={styles.receiptStoreName}>RECEIPT</Text>
                <View style={styles.receiptDashedLine} />
              </View>

              {/* Customer & Date Info */}
              <View style={styles.receiptInfoSection}>
                <View style={styles.receiptInfoRow}>
                  <Text style={styles.receiptLabel}>Customer:</Text>
                  <Text style={styles.receiptValue}>{detailModal?.client}</Text>
                </View>
                <View style={styles.receiptInfoRow}>
                  <Text style={styles.receiptLabel}>Date:</Text>
                  <Text style={styles.receiptValue}>{new Date().toLocaleDateString()}</Text>
                </View>
                <View style={styles.receiptInfoRow}>
                  <Text style={styles.receiptLabel}>Time:</Text>
                  <Text style={styles.receiptValue}>{new Date().toLocaleTimeString()}</Text>
                </View>
                <View style={styles.receiptDashedLine} />
              </View>

              {/* Items List */}
              <ScrollView style={styles.receiptItemsScroll} showsVerticalScrollIndicator={false}>
                {detailModal?.items.map((it, idx) => (
                  <View key={idx}>
                    <View style={styles.receiptItemRow}>
                      <View style={styles.receiptItemNameQty}>
                        <Text style={styles.receiptItemName} numberOfLines={2}>{it.name}</Text>
                        <Text style={styles.receiptItemQtyPrice}>
                          {String(it.quantity)} x {currencySymbol}{it.unitPrice.toFixed(2)}
                        </Text>
                      </View>
                      <Text style={styles.receiptItemTotal}>
                        {currencySymbol}{(it.quantity * it.unitPrice).toFixed(2)}
                      </Text>
                    </View>
                    {idx < detailModal.items.length - 1 && <View style={styles.receiptDottedLine} />}
                  </View>
                ))}
              </ScrollView>

              {/* Total Section */}
              <View style={styles.receiptDashedLine} />
              <View style={styles.receiptTotalSection}>
                <View style={styles.receiptSubtotalRow}>
                  <Text style={styles.receiptSubtotalLabel}>Subtotal:</Text>
                  <Text style={styles.receiptSubtotalValue}>
                    {detailModal ? `${currencySymbol}${detailModal.total.toFixed(2)}` : ''}
                  </Text>
                </View>
                <View style={styles.receiptDoubleLine} />
                <View style={styles.receiptGrandTotalRow}>
                  <Text style={styles.receiptGrandTotalLabel}>TOTAL:</Text>
                  <Text style={styles.receiptGrandTotalValue}>
                    {detailModal ? `${currencySymbol}${detailModal.total.toFixed(2)}` : ''}
                  </Text>
                </View>
                <View style={styles.receiptDoubleLine} />
              </View>

              {/* Thank You Message */}
              <View style={styles.receiptFooterMsg}>
                <Text style={styles.receiptThankYou}>Thank You!</Text>
                <Text style={styles.receiptFooterText}>Please come again</Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.receiptActions}>
                <Pressable 
                  style={({ pressed }) => [
                    styles.receiptActionBtn,
                    { backgroundColor: '#ef4444', opacity: pressed ? 0.85 : 1 }
                  ]} 
                  onPress={() => detailModal && confirmDeletePin(detailModal.pinId)}
                >
                  <FontAwesome name="trash-o" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.receiptActionBtnText}>Delete</Text>
                </Pressable>
                <Pressable 
                  style={({ pressed }) => [
                    styles.receiptActionBtn,
                    { backgroundColor: '#6b7280', opacity: pressed ? 0.85 : 1 }
                  ]} 
                  onPress={() => setDetailModal(null)}
                >
                  <FontAwesome name="times" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.receiptActionBtnText}>Close</Text>
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
    width: "96%",
    maxWidth: 680,
    maxHeight: "85%",
    borderRadius: 12,
    padding: 26,
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
    maxHeight: 480,
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

  // Receipt Paper Styles - Traditional Receipt Look
  receiptPaper: {
    width: '92%',
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 24,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
  },
  receiptHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  receiptStoreName: {
    fontSize: 24,
    fontWeight: '900',
    color: '#2c3e50',
    letterSpacing: 2,
    marginTop: 8,
    marginBottom: 12,
  },
  receiptDashedLine: {
    width: '100%',
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#9ca3af',
    marginVertical: 12,
  },
  receiptDottedLine: {
    width: '100%',
    height: 1,
    borderStyle: 'dotted',
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginVertical: 8,
  },
  receiptDoubleLine: {
    width: '100%',
    height: 3,
    backgroundColor: '#2c3e50',
    marginVertical: 8,
  },
  receiptInfoSection: {
    marginBottom: 12,
  },
  receiptInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  receiptLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  receiptValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2c3e50',
  },
  receiptItemsScroll: {
    maxHeight: 300,
  },
  receiptItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  receiptItemNameQty: {
    flex: 1,
    marginRight: 12,
  },
  receiptItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 2,
  },
  receiptItemQtyPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  receiptItemTotal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2c3e50',
    minWidth: 80,
    textAlign: 'right',
  },
  receiptTotalSection: {
    marginTop: 8,
    marginBottom: 16,
  },
  receiptSubtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  receiptSubtotalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  receiptSubtotalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50',
  },
  receiptGrandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  receiptGrandTotalLabel: {
    fontSize: 18,
    fontWeight: '900',
    color: '#2c3e50',
    letterSpacing: 1,
  },
  receiptGrandTotalValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#2c3e50',
    letterSpacing: 0.5,
  },
  receiptFooterMsg: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  receiptThankYou: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2c3e50',
    marginBottom: 4,
  },
  receiptFooterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
  },
  
  // Receipt action buttons
  receiptActions: {
    flexDirection: 'row',
    gap: 8,
  },
  receiptActionBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },

  // (Optional) If you later decide to split columns like in client.tsx:
  // detailItem: { flex: 1, fontSize: 16, fontWeight: "600" },
  // detailQty:  { width: 44, textAlign: "center", fontWeight: "700" },
  // detailPrice:{ width: 76, textAlign: "right",  fontWeight: "700" },
  // detailTotal:{ width: 86, textAlign: "right",  marginLeft: 12, fontWeight: "800" },
});