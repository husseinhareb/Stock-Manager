// src/screens/(tabs)/client.tsx
import type { Article, Price } from '@/src/db';
import {
  deleteSavedClient,
  fetchClientItems,
  fetchPrices,
  fetchSavedClients,
  fetchSecondaryStock,
  getSetting,
  saveClient as persistClient,
  sellSecondary,
} from '@/src/db';
import { Colors } from '@constants/Colors';
import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { useColorScheme } from '@hooks/useColorScheme';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ClientItem = {
  id: number;
  name: string;
  quantity: number;
  unitPrice: number;
  available: number;
};

type SavedSummary = {
  id: number;
  client: string;
  created_at: number;
  total: number;
};

type SavedClientDetail = {
  id: number;
  client: string;
  total: number;
  items: ClientItem[];
  created_at?: number;
};
type ReceiptPayload = { client: string; total: number; items: ClientItem[] };

export default function ClientScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? 'light'];

  const [currencyCode, setCurrencyCode] = useState('USD');
  const [currencySymbol, setCurrencySymbol] = useState('$');

  const SYMBOLS: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF', CNY: '¥', BRL: 'R$',
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

  const [brazilStock, setBrazilStock] = useState<Article[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [savedClients, setSavedClients] = useState<SavedSummary[]>([]);
  const [selection, setSelection] = useState<Record<number, string>>({});
  const [clientName, setClientName] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [clientModalVisible, setClientModalVisible] = useState(false);
  const [detailModal, setDetailModal] = useState<SavedClientDetail | null>(null);

  // Handle Android hardware back button when building to cancel
  useEffect(() => {
    if (Platform.OS === 'android' && isBuilding) {
      const onBackPress = () => {
        setIsBuilding(false);
        setClientName('');
        setSelection({});
        return true; // Prevent default behavior
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }
  }, [isBuilding]);

  const loadData = useCallback(async () => {
    try {
      const [stock, pr, saved] = await Promise.all([
        fetchSecondaryStock(),
        fetchPrices(),
        fetchSavedClients(),
      ]);
      setBrazilStock(stock);
      setPrices(pr);
      setSavedClients(saved);
    } catch (e: any) {
      Alert.alert(t('client.alert.loadFailed'), e.message);
    }
  }, [t]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const priceMap = useMemo(() => {
    const map: Record<number, number> = {};
    prices.forEach((p) => { map[p.article_id] = p.price; });
    return map;
  }, [prices]);

  const currentItems = useMemo<ClientItem[]>(() => {
    return brazilStock
      .map((a) => {
        const qty = parseInt(selection[a.id] || '0', 10);
        if (qty > 0) {
          return { id: a.id, name: a.name, quantity: qty, unitPrice: priceMap[a.id] || 0, available: a.quantity };
        }
        return null;
      })
      .filter((x): x is ClientItem => !!x);
  }, [brazilStock, selection, priceMap]);

  const currentTotal = useMemo(() => currentItems.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0), [currentItems]);
  const totalUnits = useMemo(() => currentItems.reduce((sum, it) => sum + it.quantity, 0), [currentItems]);

  const distinctItems = currentItems.length;

  const saveClient = async () => {
    if (!clientName.trim()) return Alert.alert(t('client.alert.enterName'));
    if (currentItems.length === 0) return Alert.alert(t('client.alert.selectItem'));
    try {
      await Promise.all(currentItems.map((it) => sellSecondary(it.id, it.quantity)));
      await persistClient(clientName.trim(), currentItems.map((it) => ({ article_id: it.id, quantity: it.quantity, price: it.unitPrice, name: it.name })));
      setSelection({}); setClientName(''); setIsBuilding(false); loadData();
    } catch (e: any) { Alert.alert(t('client.alert.error'), e.message); }
  };

  const openDetail = async (summary: SavedSummary) => {
    try {
      const lines = await fetchClientItems(summary.id);
      setDetailModal({ id: summary.id, client: summary.client, total: summary.total, created_at: summary.created_at, items: lines.map((l) => ({ id: l.article_id, name: l.name, quantity: l.quantity, unitPrice: l.price, available: 0 })) });
    } catch (e: any) { Alert.alert(t('client.alert.detailLoadFailed'), e.message); }
  };

  // put near other handlers
  const confirmDeleteSaved = (id: number) => {
    Alert.alert(t('client.alert.confirmDeleteTitle'), t('client.alert.confirmDeleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' }, { text: t('common.delete'), style: 'destructive', onPress: () => handleDelete(id) }
    ]);
  };

  const handleDelete = async (id: number) => { try { await deleteSavedClient(id); loadData(); } catch (e: any) { Alert.alert(t('client.alert.error'), e.message); } };

  const shareReceipt = async (cart: ReceiptPayload) => {
    const rows = cart.items.map((it) => `
      <tr>
        <td style=\\"padding: 8px; border: 1px solid #ccc;\\">${it.name}</td>
        <td style=\\"padding: 8px; border: 1px solid #ccc; text-align: center;\\">${it.quantity}</td>
        <td style=\\"padding: 8px; border: 1px solid #ccc; text-align: right;\\">${currencySymbol}${it.unitPrice.toFixed(2)}</td>
        <td style=\\"padding: 8px; border: 1px solid #ccc; text-align: right;\\">${currencySymbol}${(it.quantity * it.unitPrice).toFixed(2)}</td>
      </tr>
    `).join('');

    const html = `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            padding: 24px;
            color: #333;
          }
          h1 {
            font-size: 22px;
            margin-bottom: 24px;
            text-align: center;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
          }
          th {
            background-color: #f2f2f2;
            text-align: left;
            padding: 8px;
            border: 1px solid #ccc;
          }
          td {
            font-size: 14px;
          }
          .total {
            font-weight: bold;
            text-align: right;
            padding: 8px;
            border: 1px solid #ccc;
            background-color: #f9f9f9;
          }
        </style>
      </head>
      <body>
        <h1>${t('client.receiptTitle', { name: cart.client })}</h1>
        <table>
          <thead>
            <tr>
              <th>${t('client.table.item')}</th>
              <th>${t('client.table.qty')}</th>
              <th>${t('client.table.unitPrice')}</th>
              <th>${t('client.table.total')}</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr>
              <td colspan=\"3\" class=\"total\">${t('client.table.grandTotal')}</td>
              <td class=\"total\">${currencySymbol}${cart.total.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  `;

    try {
      // 2. Generate the PDF (temporary file)
      const { uri } = await Print.printToFileAsync({ html });

      // 3. Build a safe filename from the client name
      //    Replace spaces/special chars as needed:
      const safeName = cart.client
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_');
      const newFilename = `${safeName}.pdf`;

      // 4. Define a new URI in the app's document directory
      const newUri = `${(FileSystem as any).documentDirectory}${newFilename}`;

      // 5. If a file with that name already exists, delete it
      const info = await FileSystem.getInfoAsync(newUri);
      if (info.exists) {
        await FileSystem.deleteAsync(newUri, { idempotent: true });
      }

      // 6. Move (rename) the temp PDF to the new URI
      await FileSystem.moveAsync({
        from: uri,
        to: newUri,
      });

      // 7. Share the renamed PDF
      await Sharing.shareAsync(newUri);
    } catch (e: any) {
      Alert.alert(t('client.alert.shareFailed'), e.message);
    }
  };

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {!isBuilding && (
          <TouchableOpacity
            onPress={() => setClientModalVisible(true)}
            style={[styles.addBtn, { backgroundColor: theme.accent }]}
          >
            <FontAwesome name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        )}

        {isBuilding ? (
          <>
            <View style={styles.subHeaderRow}>
              <FontAwesome name="user-circle" size={20} color={theme.primary} />
              <Text style={[styles.subHeader, { color: theme.primary }]}> 
                {clientName || t('client.newClient')}
              </Text>
            </View>
            <ScrollView
              style={styles.itemList}
              contentContainerStyle={{ paddingBottom: 96 }}
            >
              {brazilStock.map((a) => {
                const raw = selection[a.id];
                const selected = raw !== undefined;
                return (
                  <View
                    key={a.id}
                    style={[
                      styles.card,
                      { backgroundColor: theme.card, shadowColor: theme.shadow },
                    ]}
                  >
                    <Pressable
                      onPress={() =>
                        setSelection((sel) => {
                          const next = { ...sel };
                          if (selected) delete next[a.id];
                          else next[a.id] = '1';
                          return next;
                        })
                      }
                    >
                      <MaterialIcons
                        name={
                          selected ? 'check-box' : 'check-box-outline-blank'
                        }
                        size={24}
                        color={theme.accent}
                      />
                    </Pressable>
                    <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>
                      {a.name}
                    </Text>
                    <Text style={[styles.infoText, { color: theme.text }]}> {t('client.available', { count: a.quantity })} </Text>
                    <Text style={[styles.infoText, { color: theme.text }]}>{`${currencySymbol}${(priceMap[a.id] || 0).toFixed(2)}`}</Text>
                    <TextInput
                      value={raw}
                      editable={selected}
                      keyboardType="numeric"
                      onChangeText={(val) => setSelection((sel) => ({ ...sel, [a.id]: val }))}
                      style={[
                        styles.qtyInput,
                        { borderColor: theme.border, color: theme.text, backgroundColor: theme.background },
                      ]}
                      placeholder={t('client.table.qty')}
                      placeholderTextColor={theme.placeholder}
                    />
                  </View>
                );
              })}
            </ScrollView>
            <View
              style={[
                styles.builderFooter,
                { backgroundColor: theme.card, borderColor: theme.border, bottom: 0 },
              ]}
            >
              <View style={styles.totalBadges}>
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: theme.background, borderColor: theme.border },
                  ]}
                  accessible
                  accessibilityLabel={`Total amount ${currencySymbol}${currentTotal.toFixed(2)}`}
                >
                  <FontAwesome name="money" size={16} color={theme.text} />
                  <Text style={[styles.badgeText, { color: theme.text }]} numberOfLines={1}>
                    {`${currencySymbol}${currentTotal.toFixed(2)}`}
                  </Text>
                </View>

                <View
                  style={[
                    styles.badge,
                    { backgroundColor: theme.background, borderColor: theme.border },
                  ]}
                  accessible
                  accessibilityLabel={`Total items ${totalUnits}`}
                >
                  <FontAwesome name="cubes" size={16} color={theme.text} />
                  <Text style={[styles.badgeText, { color: theme.text }]} numberOfLines={1}>
                    {totalUnits}
                  </Text>
                </View>
              </View>

              <View style={styles.footerButtons}>
                <Pressable onPress={saveClient} style={[styles.actionBtn, { backgroundColor: theme.accent }]}> 
                  <FontAwesome name="save" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>{t('common.save')}</Text>
                </Pressable>
                <Pressable onPress={() => shareReceipt({ client: clientName, total: currentTotal, items: currentItems })} style={[styles.actionBtn, { backgroundColor: theme.accent }]}> 
                  <Text style={styles.actionBtnText}>{t('client.sharePDF')}</Text>
                </Pressable>
              </View>
            </View>
          </>
        ) : (
          <FlatList
            data={savedClients}
            keyExtractor={(i) => i.id.toString()}
            ListEmptyComponent={() => (
              <View style={styles.emptyContainer}>
                <FontAwesome name="inbox" size={48} color={theme.placeholder} />
                <Text style={[styles.emptyText, { color: theme.placeholder }]}>{t('client.empty')}</Text>
              </View>
            )}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.shadow }]}
                onPress={() => openDetail(item)}
                onLongPress={() => confirmDeleteSaved(item.id)}
              >
                <FontAwesome name="user" size={24} color={theme.accent} style={styles.icon} />
                <Text style={[styles.cardText, { color: theme.text }]}>{item.client}</Text>
                <Text style={[styles.infoText, { color: theme.text }]}>{`${currencySymbol}${item.total.toFixed(2)}`}</Text>
                <Pressable onPress={() => confirmDeleteSaved(item.id)} hitSlop={10} accessibilityLabel={t('client.a11y.deleteClient', { name: item.client })} style={styles.trashBtn}>
                  <FontAwesome name="trash" size={18} color={theme.accent} />
                </Pressable>
              </Pressable>
            )}
          />
        )}

        {/* Name Modal */}
        <Modal visible={clientModalVisible} transparent animationType="fade" onRequestClose={() => { setClientModalVisible(false); }}> 
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
              <FontAwesome name="user-circle" size={32} color={theme.accent} style={styles.modalIcon} />
              <Text style={[styles.modalTitle, { color: theme.primary }]}>{t('client.newClientName')}</Text>
              <TextInput value={clientName} onChangeText={setClientName} placeholder={t('client.placeholder.name')} placeholderTextColor={theme.placeholder} style={[styles.modalInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]} />
              <View style={styles.modalActions}>
                <Pressable onPress={() => { if (!clientName.trim()) { return Alert.alert(t('client.alert.enterName')); } setClientModalVisible(false); setIsBuilding(true); }} style={[styles.modalBtn, { backgroundColor: theme.accent }]}>
                  <Text style={{ color: '#fff' }}>{t('common.save')}</Text>
                </Pressable>
                <Pressable onPress={() => setClientModalVisible(false)} style={[styles.modalBtn, { borderWidth: 1, borderColor: theme.accent, backgroundColor: 'transparent' }]}>
                  <Text style={{ color: theme.accent, fontWeight: '600' }}>{t('common.cancel')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Detail Modal */}
        <Modal visible={!!detailModal} transparent animationType="slide" onRequestClose={() => { setDetailModal(null); }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
              {/* Enhanced receipt header with icon */}
              <View style={[styles.receiptHeader, { borderBottomWidth: 2, borderBottomColor: theme.primary + '20', paddingBottom: 16 }]}>
                <View style={[styles.receiptIconContainer, { backgroundColor: theme.primary + '15' }]}>
                  <Text style={{ fontSize: 32 }}>📋</Text>
                </View>
                <Text style={[styles.receiptTitle, { color: theme.primary }]}>{detailModal?.client}</Text>
                <Text style={[styles.receiptMeta, { color: theme.placeholder }]}>
                  📅 {detailModal && detailModal.created_at ? new Date(detailModal.created_at).toLocaleString() : new Date().toLocaleString()}
                </Text>
                <View style={[styles.receiptDivider, { backgroundColor: theme.primary }]} />
              </View>

              <View style={[styles.receiptTableContainer, { borderColor: theme.border }]}>
                <View style={[styles.receiptColumnsHeader, { backgroundColor: theme.primary, borderTopLeftRadius: 12, borderTopRightRadius: 12 }]}>
                  <Text style={[styles.colName, { color: '#fff', fontWeight: '800', fontSize: 13 }]}>{t('client.table.item')}</Text>
                  <Text style={[styles.colQty, { color: '#fff', fontWeight: '800', fontSize: 13 }]}>{t('client.table.qty')}</Text>
                  <Text style={[styles.colPrice, { color: '#fff', fontWeight: '800', fontSize: 13 }]}>{t('client.table.unitPrice')}</Text>
                  <Text style={[styles.colTotal, { color: '#fff', fontWeight: '800', fontSize: 13 }]}>{t('client.table.total')}</Text>
                </View>

                <ScrollView style={styles.receiptBody} showsVerticalScrollIndicator={false}>
                  {detailModal?.items.map((it, idx) => (
                    <View key={idx} style={[
                      styles.receiptRow, 
                      idx % 2 ? styles.receiptRowAlt : { backgroundColor: '#fff' },
                      { borderBottomWidth: idx === detailModal.items.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: theme.border }
                    ]}>
                      <Text style={[styles.colName, { color: theme.text }]} numberOfLines={2}>{it.name}</Text>
                      <Text style={[styles.colQty, { color: theme.text }]}>{String(it.quantity)}</Text>
                      <Text style={[styles.colPrice, { color: theme.text }]}>{`${currencySymbol}${it.unitPrice.toFixed(2)}`}</Text>
                      <Text style={[styles.colTotal, { color: theme.text, fontWeight: '900' }]}>{`${currencySymbol}${(it.quantity * it.unitPrice).toFixed(2)}`}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>

              {/* Enhanced footer with better visual hierarchy */}
              <View style={[styles.receiptFooter, { borderRadius: 12, marginTop: 16 }]}>
                <View style={[styles.receiptTotalContainer, { backgroundColor: theme.primary, borderRadius: 12 }]}>
                  <View style={styles.receiptTotalRow}>
                    <Text style={styles.receiptTotalIcon}>💰</Text>
                    <Text style={styles.receiptTotalLabel}>{t('client.table.total')}</Text>
                  </View>
                  <Text style={styles.receiptTotalValue}>{detailModal ? `${currencySymbol}${detailModal.total.toFixed(2)}` : ''}</Text>
                </View>
              </View>

              {/* Enhanced action buttons */}
              <View style={styles.receiptActions}>
                <Pressable 
                  onPress={() => detailModal && shareReceipt(detailModal)} 
                  style={({ pressed }) => [
                    styles.receiptActionBtn, 
                    { backgroundColor: '#10b981', opacity: pressed ? 0.85 : 1, flex: 1 }
                  ]}
                > 
                  <Text style={styles.receiptActionBtnText}>📤 {t('client.sharePDF')}</Text>
                </Pressable>
                {detailModal && (
                  <Pressable 
                    onPress={() => { confirmDeleteSaved(detailModal.id); setDetailModal(null); }} 
                    style={({ pressed }) => [
                      styles.receiptActionBtn,
                      { backgroundColor: '#ef4444', opacity: pressed ? 0.85 : 1, flex: 1 }
                    ]}
                  > 
                    <Text style={styles.receiptActionBtnText}>🗑️ {t('common.delete')}</Text>
                  </Pressable>
                )}
                <Pressable 
                  onPress={() => setDetailModal(null)} 
                  style={({ pressed }) => [
                    styles.receiptActionBtn,
                    { backgroundColor: theme.text + '20', opacity: pressed ? 0.85 : 1, flex: 1 }
                  ]}
                > 
                  <Text style={[styles.receiptActionBtnText, { color: theme.text }]}>✕ {t('common.close')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Styles
const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header (unused in this file but refreshed)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    elevation: 6,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginLeft: 12,
    letterSpacing: 0.3,
  },

  // Floating action button
  addBtn: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8, // Android shadow
    zIndex: 10,
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 36,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    fontStyle: 'italic',
    opacity: 0.7,
  },

  // Cards
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginVertical: 7,
    borderRadius: 14,
    elevation: 3,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { marginRight: 12 },
  cardText: { flex: 1, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },

  // Inline info bits
  infoText: {
    minWidth: 88,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.85,
    marginLeft: 8,
  },
  itemName: {
    flex: 1,
    fontSize: 16,
    marginHorizontal: 8,
    fontWeight: '600',
  },
  qtyInput: {
    width: 64,
    height: 40,
    borderWidth: 1,
    borderRadius: 10,
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginLeft: 10,
    fontSize: 16,
    fontWeight: '700',
  },

  // Builder
  subHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 4,
  },
  subHeader: {
    fontSize: 18,
    fontWeight: '800',
    marginLeft: 8,
    letterSpacing: 0.3,
  },
  itemList: { flex: 1, marginTop: 8 },

  // Footer (pinned)
  builderFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    /* bottom is injected inline */
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 12,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  totalText: { fontSize: 18, fontWeight: '800', letterSpacing: 0.2 },

  footerButtons: {
    flexDirection: 'row',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginLeft: 12,
    minWidth: 108,
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '800',
    marginLeft: 8,
    fontSize: 15,
    letterSpacing: 0.3,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '96%',
    maxWidth: 680,
    maxHeight: '85%',
    borderRadius: 12,
    padding: 26,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalIcon: { alignSelf: 'center', marginBottom: 14 },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  modalInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    marginBottom: 20,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginLeft: 12,
  },

  // Detail modal
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  detailHeaderTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginLeft: 10,
    letterSpacing: 0.2,
  },
  detailList: {
    maxHeight: 480,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailRowAlt: {
    backgroundColor: 'rgba(0,0,0,0.03)',
  },

  detailItem: { flex: 1, fontSize: 16, fontWeight: '600' },
  detailQty: { width: 44, textAlign: 'center', fontWeight: '700' },
  detailPrice: { width: 76, textAlign: 'right', fontWeight: '700' },
  detailTotal: { width: 86, textAlign: 'right', marginLeft: 12, fontWeight: '800' },

  // Total badges
  totalBadges: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  badgeText: { marginLeft: 8, fontWeight: '800', fontSize: 16, letterSpacing: 0.2 },
  trashBtn: { marginLeft: 8, padding: 6, borderRadius: 8 },

  // Receipt styles (for detail modal) - Enhanced
  receiptHeader: { alignItems: 'center', marginBottom: 12 },
  receiptIconContainer: { 
    width: 72, 
    height: 72, 
    borderRadius: 36, 
    alignItems: 'center', 
    justifyContent: 'center',
    marginBottom: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  receiptTitle: { fontSize: 22, fontWeight: '900', letterSpacing: 0.4, marginBottom: 6 },
  receiptMeta: { fontSize: 13, marginTop: 4, opacity: 0.85, fontWeight: '600' },
  receiptDivider: { 
    width: 60, 
    height: 3, 
    borderRadius: 2, 
    marginTop: 12,
    opacity: 0.8,
  },
  receiptTableContainer: {
    borderWidth: 2,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
  },
  receiptBody: { 
    maxHeight: 480, 
    backgroundColor: '#fff',
  },
  receiptColumnsHeader: { 
    flexDirection: 'row', 
    paddingHorizontal: 16, 
    paddingVertical: 14,
  },
  receiptRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 14, 
    paddingHorizontal: 16,
    minHeight: 52,
  },
  receiptRowAlt: { backgroundColor: '#f9fafb' },
  colName: { flex: 2, fontSize: 15, fontWeight: '600', letterSpacing: 0.1 },
  colQty: { width: 60, textAlign: 'center', fontWeight: '700', fontSize: 15 },
  colPrice: { width: 90, textAlign: 'right', fontWeight: '600', fontSize: 15 },
  colTotal: { width: 100, textAlign: 'right', fontWeight: '800', fontSize: 16 },
  receiptFooter: { 
    paddingHorizontal: 0, 
    paddingVertical: 0, 
    marginTop: 4,
  },
  receiptFooterLabel: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  receiptFooterValue: { fontSize: 15, fontWeight: '700' },
  receiptTotalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 18,
    paddingHorizontal: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  receiptTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  receiptTotalIcon: {
    fontSize: 24,
  },
  receiptTotalLabel: { fontSize: 20, fontWeight: '900', letterSpacing: 0.3, color: '#fff' },
  receiptTotalValue: { fontSize: 24, fontWeight: '900', letterSpacing: 0.2, color: '#fff' },
  
  // Receipt action buttons
  receiptActions: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  receiptActionBtn: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptActionBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  receiptShareBtn: {},
  receiptDeleteBtn: {},
  receiptCloseBtn: {},
});

