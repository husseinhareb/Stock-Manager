// app/(tabs)/client.tsx
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import type { Article, Price } from '../../src/db';
import {
  fetchClientItems,
  fetchPrices,
  fetchSavedClients,
  fetchSecondaryStock,
  saveClient as persistClient,
  sellSecondary,
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
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? 'light'];

  // State
  const [brazilStock, setBrazilStock] = useState<Article[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [savedClients, setSavedClients] = useState<SavedSummary[]>([]);
  const [selection, setSelection] = useState<Record<number, string>>({});
  const [clientName, setClientName] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [clientModalVisible, setClientModalVisible] = useState(false);
  const [detailModal, setDetailModal] = useState<SavedClientDetail | null>(null);

  // Load initial data
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
      Alert.alert('Load Failed', e.message);
    }
  }, []);
  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Price map
  const priceMap = useMemo(() => {
    const m: Record<number, number> = {};
    prices.forEach(p => m[p.article_id] = p.price);
    return m;
  }, [prices]);

  // Build current items
  const currentItems: ClientItem[] = useMemo(() => {
    return brazilStock
      .map(a => {
        const raw = selection[a.id];
        const qty = parseInt(raw || '0', 10);
        if (qty > 0) {
          return {
            id: a.id,
            name: a.name,
            quantity: qty,
            unitPrice: priceMap[a.id] || 0,
            available: a.quantity,
          };
        }
        return null;
      })
      .filter((x): x is ClientItem => !!x);
  }, [selection, brazilStock, priceMap]);

  const currentTotal = useMemo(
    () => currentItems.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0),
    [currentItems]
  );

  // Actions
  const saveClient = async () => {
    if (!clientName.trim()) {
      return Alert.alert('Enter client name');
    }
    if (currentItems.length === 0) {
      return Alert.alert('Select at least one item');
    }
    try {
      await Promise.all(currentItems.map(it => sellSecondary(it.id, it.quantity)));
      await persistClient(clientName.trim(), currentItems.map(it => ({
        article_id: it.id,
        quantity: it.quantity,
        price: it.unitPrice,
      })));
      setSelection({});
      setClientName('');
      setIsBuilding(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const openDetail = async (summary: SavedSummary) => {
    try {
      const lines = await fetchClientItems(summary.id);
      setDetailModal({
        client: summary.client,
        total: summary.total,
        items: lines.map(l => ({
          id: l.article_id,
          name: l.name,
          quantity: l.quantity,
          unitPrice: l.price,
          available: 0,
        })),
      });
    } catch (e: any) {
      Alert.alert('Error loading details', e.message);
    }
  };

  const shareReceipt = async (cart: SavedClientDetail) => {
    const rows = cart.items.map(it => `
      <tr>
        <td>${it.name}</td>
        <td style="text-align:center">${it.quantity}</td>
        <td style="text-align:right">${it.unitPrice.toFixed(2)}</td>
        <td style="text-align:right">${(it.quantity * it.unitPrice).toFixed(2)}</td>
      </tr>
    `).join('');
    const html = `
      <h1>Receipt: ${cart.client}</h1>
      <table width="100%" style="border-collapse:collapse" border="1" cellpadding="5">
        <tr><th align="left">Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
        ${rows}
        <tr>
          <td colspan="3" style="text-align:right"><strong>Grand Total</strong></td>
          <td style="text-align:right"><strong>${cart.total.toFixed(2)}</strong></td>
        </tr>
      </table>
    `;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
    } catch (e: any) {
      Alert.alert('Error sharing PDF', e.message);
    }
  };

  // UI
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          onPress={() => setClientModalVisible(true)}
          style={[styles.addBtn, { backgroundColor: theme.accent }]}
        >
          <FontAwesome name="plus" size={20} color="#fff" />
        </TouchableOpacity>
        {isBuilding ? (
          <>
            {/* Builder */}
            <View style={styles.subHeaderRow}>
              <FontAwesome name="user-circle" size={20} color={theme.primary} />
              <Text style={[styles.subHeader, { color: theme.primary }]}>
                {clientName || 'New Client'}
              </Text>
            </View>
            <ScrollView style={styles.itemList}>
              {brazilStock.map(a => {
                const raw = selection[a.id];
                const qty = parseInt(raw || '0', 10);
                const selected = raw !== undefined;
                return (
                  <View
                    key={a.id}
                    style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.shadow }]}
                  >
                    <TouchableOpacity
                      onPress={() =>
                        setSelection(sel => {
                          const next = { ...sel };
                          if (selected) delete next[a.id];
                          else next[a.id] = '1';
                          return next;
                        })
                      }
                    >
                      <MaterialIcons
                        name={selected ? 'check-box' : 'check-box-outline-blank'}
                        size={24}
                        color={theme.accent}
                      />
                    </TouchableOpacity>

                    <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>
                      {a.name}
                    </Text>

                    <Text style={[styles.infoText, { color: theme.text }]}>
                      Avail: {a.quantity}
                    </Text>

                    <Text style={[styles.infoText, { color: theme.text }]}>
                      ${(priceMap[a.id] || 0).toFixed(2)}
                    </Text>

                    <TextInput
                      value={raw}
                      editable={selected}
                      keyboardType="numeric"
                      onChangeText={t => setSelection(sel => ({ ...sel, [a.id]: t }))}
                      style={[
                        styles.qtyInput,
                        { borderColor: theme.border, color: theme.text, backgroundColor: theme.background },
                      ]}
                    />
                  </View>
                );
              })}
            </ScrollView>

            {/* Builder Footer */}
            <View style={[styles.builderFooter, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <Text style={[styles.totalText, { color: theme.text }]}>
                Total: ${currentTotal.toFixed(2)}
              </Text>
              <View style={styles.footerButtons}>
                <TouchableOpacity
                  onPress={saveClient}
                  style={[styles.actionBtn, { backgroundColor: theme.accent }]}
                >
                  <FontAwesome name="save" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    shareReceipt({
                      client: clientName,
                      total: currentTotal,
                      items: currentItems,
                    })
                  }
                  style={[styles.actionBtn, { backgroundColor: theme.accent }]}
                >
                  <Text style={styles.actionBtn}>Share PDF</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : (
          // Saved Clients List
          <FlatList
            data={savedClients}
            keyExtractor={i => i.id.toString()}
            ListEmptyComponent={() => (
              <View style={styles.emptyContainer}>
                <FontAwesome name="inbox" size={48} color={theme.placeholder} />
                <Text style={[styles.emptyText, { color: theme.placeholder }]}>
                  No clients yet. Tap + to begin.
                </Text>
              </View>
            )}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.shadow }]}
                onPress={() => openDetail(item)}
              >
                <FontAwesome name="user" size={24} color={theme.accent} style={styles.icon} />
                <Text style={[styles.cardText, { color: theme.text }]}>{item.client}</Text>
                <Text style={[styles.infoText, { color: theme.text }]}>
                  ${item.total.toFixed(2)}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}

        {/* Client Name Modal */}
        <Modal visible={clientModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
              <FontAwesome name="user-circle" size={32} color={theme.accent} style={styles.modalIcon} />
              <Text style={[styles.modalTitle, { color: theme.primary }]}>New Client Name</Text>
              <TextInput
                value={clientName}
                onChangeText={setClientName}
                placeholder="Enter name..."
                placeholderTextColor={theme.placeholder}
                style={[
                  styles.modalInput,
                  { borderColor: theme.border, color: theme.text, backgroundColor: theme.background },
                ]}
              />
              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => detailModal && shareReceipt(detailModal)}
                  style={styles.modalBtn}
                >
                  <Text>Share PDF</Text>
                </Pressable>
                <Pressable
                  onPress={() => setDetailModal(null)}
                  style={[styles.modalBtn, { backgroundColor: theme.accent }]}
                >
                  <Text style={{ color: '#fff' }}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Detail Modal */}
        <Modal visible={!!detailModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
              <View style={styles.detailHeader}>
                <FontAwesome name="book" size={28} color={theme.accent} />
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  {detailModal?.client}
                </Text>
              </View>
              <ScrollView style={styles.detailList}>
                {detailModal?.items.map((it, idx) => (
                  <View key={idx} style={styles.detailRow}>
                    <Text style={[styles.detailItem, { color: theme.text }]} numberOfLines={1}>
                      {it.name}
                    </Text>
                    <Text style={[styles.detailQty, { color: theme.text }]}>{it.quantity}</Text>
                    <Text style={[styles.detailPrice, { color: theme.text }]}>
                      ${it.unitPrice.toFixed(2)}
                    </Text>
                    <Text style={[styles.detailTotal, { color: theme.text }]}>
                      ${(it.quantity * it.unitPrice).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => detailModal && shareReceipt(detailModal)}
                  style={styles.modalBtn}
                >
                  <Text style={{ color: '#fff' }}>Share PDF</Text>
                </Pressable>
                <Pressable
                  onPress={() => setDetailModal(null)}
                  style={[styles.modalBtn, { backgroundColor: theme.accent }]}
                >
                  <Text style={{ color: '#fff' }}>Close</Text>
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
    padding: 8,
    borderRadius: 8,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderTopWidth: 1,
    marginHorizontal: 16,
  },
  totalText: { fontSize: 18, fontWeight: 'bold' },
  footerButtons: { flexDirection: 'row' },
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
