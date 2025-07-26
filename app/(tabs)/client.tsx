// app/(tabs)/client.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useTranslation } from 'react-i18next';
import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { Article, Price } from '../../src/db';
import {
  fetchSecondaryStock,
  fetchPrices,
  fetchSavedClients,
  fetchClientItems,
  sellSecondary,
  saveClient as persistClient,
  deleteSavedClient,
  getSetting
} from '../../src/db';

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
  client: string;
  total: number;
  items: ClientItem[];
};

export default function ClientScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? 'light'];

  const [currencyCode, setCurrencyCode] = useState('USD');
  const [currencySymbol, setCurrencySymbol] = useState('$');

  const SYMBOLS: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£',
    JPY: '¥', CAD: 'C$', AUD: 'A$',
    CHF: 'CHF', CNY: '¥', BRL: 'R$'
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
    prices.forEach(p => { map[p.article_id] = p.price; });
    return map;
  }, [prices]);

  const currentItems = useMemo<ClientItem[]>(() => {
    return brazilStock
      .map(a => {
        const qty = parseInt(selection[a.id] || '0', 10);
        if (qty > 0) {
          return { id: a.id, name: a.name, quantity: qty, unitPrice: priceMap[a.id] || 0, available: a.quantity };
        }
        return null;
      })
      .filter((x): x is ClientItem => !!x);
  }, [brazilStock, selection, priceMap]);

  const currentTotal = useMemo(
    () => currentItems.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0),
    [currentItems]
  );

  const saveClient = async () => {
    if (!clientName.trim()) return Alert.alert(t('client.alert.enterName'));
    if (currentItems.length === 0) return Alert.alert(t('client.alert.selectItem'));
    try {
      await Promise.all(currentItems.map(it => sellSecondary(it.id, it.quantity)));
      await persistClient(clientName.trim(), currentItems.map(it => ({ article_id: it.id, quantity: it.quantity, price: it.unitPrice })));
      setSelection({}); setClientName(''); setIsBuilding(false); loadData();
    } catch (e: any) {
      Alert.alert(t('client.alert.error'), e.message);
    }
  };

  const openDetail = async (summary: SavedSummary) => {
    try {
      const lines = await fetchClientItems(summary.id);
      setDetailModal({
        client: summary.client,
        total: summary.total,
        items: lines.map(l => ({ id: l.article_id, name: l.name, quantity: l.quantity, unitPrice: l.price, available: 0 })),
      });
    } catch (e: any) {
      Alert.alert(t('client.alert.detailLoadFailed'), e.message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSavedClient(id);
      loadData();
    } catch (e: any) {
      Alert.alert(t('client.alert.error'), e.message);
    }
  };

  const shareReceipt = async (cart: SavedClientDetail) => {
    const rows = cart.items.map(it => `
      <tr>
        <td style=\"padding: 8px; border: 1px solid #ccc;\">${it.name}</td>
        <td style=\"padding: 8px; border: 1px solid #ccc; text-align: center;\">${it.quantity}</td>
        <td style=\"padding: 8px; border: 1px solid #ccc; text-align: right;\">${currencySymbol}${it.unitPrice.toFixed(2)}</td>
        <td style=\"padding: 8px; border: 1px solid #ccc; text-align: right;\">${currencySymbol}${(it.quantity * it.unitPrice).toFixed(2)}</td>
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
              <td colspan="3" class="total">${t('client.table.grandTotal')}</td>
              <td class="total">${currencySymbol}${cart.total.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  `;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
    } catch (e: any) {
      Alert.alert(t('client.alert.shareFailed'), e.message);
    }
  };


  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!isBuilding && (
          <TouchableOpacity
            onPress={() => setClientModalVisible(true)}
            style={[styles.addBtn, { backgroundColor: theme.accent }]}>
            <FontAwesome name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        )}



        {isBuilding ? (
          <>
            <View style={styles.subHeaderRow}>
              <FontAwesome name="user-circle" size={20} color={theme.primary} />
              <Text style={[styles.subHeader, { color: theme.primary }]}>{clientName || t('client.newClient')}</Text>
            </View>
            <ScrollView style={styles.itemList}>
              {brazilStock.map(a => {
                const raw = selection[a.id];
                const selected = raw !== undefined;
                return (
                  <View key={a.id} style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
                    <Pressable onPress={() => setSelection(sel => {
                      const next = { ...sel };
                      if (selected) delete next[a.id]; else next[a.id] = '1';
                      return next;
                    })}>
                      <MaterialIcons name={selected ? 'check-box' : 'check-box-outline-blank'} size={24} color={theme.accent} />
                    </Pressable>
                    <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>{a.name}</Text>
                    <Text style={[styles.infoText, { color: theme.text }]}>{t('client.available', { count: a.quantity })}</Text>
                    <Text style={[styles.infoText, { color: theme.text }]}>{`${currencySymbol}${(priceMap[a.id] || 0).toFixed(2)}`}</Text>
                    <TextInput
                      value={raw}
                      editable={selected}
                      keyboardType="numeric"
                      onChangeText={val => setSelection(sel => ({ ...sel, [a.id]: val }))}
                      style={[styles.qtyInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
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
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  bottom: 0, 
                },
              ]}
            >
              <Text style={[styles.totalText, { color: theme.text }]}>
                {t('client.total', { total: currentTotal.toFixed(2) })}
              </Text>
              <View style={styles.footerButtons}>
                <Pressable onPress={saveClient} style={[styles.actionBtn, { backgroundColor: theme.accent }]}>
                  <FontAwesome name="save" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>{t('common.save')}</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    shareReceipt({ client: clientName, total: currentTotal, items: currentItems })
                  }
                  style={[styles.actionBtn, { backgroundColor: theme.accent }]}
                >
                  <Text style={styles.actionBtnText}>{t('client.sharePDF')}</Text>
                </Pressable>
              </View>
            </View>

          </>
        ) : (
          <FlatList
            data={savedClients}
            keyExtractor={i => i.id.toString()}
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
                onLongPress={() =>
                  Alert.alert(
                    t('client.alert.confirmDeleteTitle'),
                    t('client.alert.confirmDeleteMessage'),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('common.delete'),
                        style: 'destructive',
                        onPress: () => handleDelete(item.id),
                      },
                    ]
                  )
                }
              >
                <FontAwesome name="user" size={24} color={theme.accent} style={styles.icon} />
                <Text style={[styles.cardText, { color: theme.text }]}>{item.client}</Text>
                <Text style={[styles.infoText, { color: theme.text }]}>{`${currencySymbol}${item.total.toFixed(2)}`}</Text>
              </Pressable>

            )}
          />
        )}

        {/* Name Modal */}
        <Modal visible={clientModalVisible} transparent animationType="fade" onRequestClose={() => { setClientModalVisible(false) }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
              <FontAwesome name="user-circle" size={32} color={theme.accent} style={styles.modalIcon} />
              <Text style={[styles.modalTitle, { color: theme.primary }]}>{t('client.newClientName')}</Text>
              <TextInput
                value={clientName}
                onChangeText={setClientName}
                placeholder={t('client.placeholder.name')}
                placeholderTextColor={theme.placeholder}
                style={[styles.modalInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
              />
              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => {
                    if (!clientName.trim()) {
                      return Alert.alert(t('client.alert.enterName'));
                    }
                    setClientModalVisible(false);
                    setIsBuilding(true);
                  }}
                  style={[styles.modalBtn, { backgroundColor: theme.accent }]}
                >
                  <Text style={{ color: '#fff' }}>{t('common.save')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setClientModalVisible(false)}
                  style={[
                    styles.modalBtn,
                    { borderWidth: 1, borderColor: theme.accent, backgroundColor: 'transparent' }
                  ]}
                >
                  <Text style={{ color: theme.accent, fontWeight: '600' }}>
                    {t('common.cancel')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Detail Modal */}
        <Modal visible={!!detailModal} transparent animationType="slide" onRequestClose={() => { setDetailModal(null) }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
              <View style={styles.detailHeader}>
                <FontAwesome name="book" size={28} color={theme.accent} />
                <Text style={[styles.detailHeaderTitle, { color: theme.text }]}>
                  {detailModal?.client}
                </Text>
              </View>
              <ScrollView style={styles.detailList}>
                {detailModal?.items.map((it, idx) => (
                  <View key={idx} style={styles.detailRow}>
                    <Text style={[styles.detailItem, { color: theme.text }]} numberOfLines={1}>{it.name}</Text>
                    <Text style={[styles.detailQty, { color: theme.text }]}>{it.quantity}</Text>
                    <Text style={[styles.detailPrice, { color: theme.text }]}>{`${currencySymbol}${it.unitPrice.toFixed(2)}`}</Text>
                    <Text style={[styles.detailTotal, { color: theme.text }]}>{`${currencySymbol}${(it.quantity * it.unitPrice).toFixed(2)}`}</Text>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.modalActions}>
                <Pressable onPress={() => detailModal && shareReceipt(detailModal)} style={styles.modalBtn}>
                  <Text style={{ color: '#fff' }}>{t('client.sharePDF')}</Text>
                </Pressable>
                <Pressable onPress={() => setDetailModal(null)} style={[styles.modalBtn, { backgroundColor: theme.accent }]}>
                  <Text style={{ color: '#fff' }}>{t('common.close')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView >
  );
}


// Styles
const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
  },
  headerText: {
    flex: 1,
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 12,
  },
  addBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,                    // Android shadow
    zIndex: 10,                      // bring above other views on iOS
    shadowColor: '#000',             // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },


  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    fontStyle: 'italic',
  },

  // Cards
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 12,
    elevation: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
  },
  icon: { marginRight: 12 },
  cardText: { flex: 1, fontSize: 16, fontWeight: '600' },
  infoText: { width: 80, textAlign: 'center', fontSize: 14 },
  itemName: { flex: 1, fontSize: 16, marginHorizontal: 8 },
  qtyInput: {
    width: 50,
    height: 32,
    borderWidth: 1,
    borderRadius: 6,
    textAlign: 'center',
    padding: 4,
    marginLeft: 8,
  },

  // Builder
  subHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
  },
  subHeader: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  itemList: { flex: 1, marginTop: 8 },

  builderFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    /* bottom is now injected inline */
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  totalText: { fontSize: 18, fontWeight: 'bold' },
  footerButtons: {
    flexDirection: 'row'

  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 12,
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 6,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBox: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 12,
    padding: 20,
    elevation: 6,
  },
  modalIcon: { alignSelf: 'center', marginBottom: 12 },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginLeft: 12,
  },

  // Detail modal
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 8,
  },
  detailList: { maxHeight: 240, marginBottom: 16 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  detailItem: { flex: 1, fontSize: 16 },
  detailQty: { width: 40, textAlign: 'center' },
  detailPrice: { width: 60, textAlign: 'right' },
  detailTotal: { width: 70, textAlign: 'right', marginLeft: 12 },
});