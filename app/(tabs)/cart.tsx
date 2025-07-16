// app/(tabs)/cart.tsx
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  SectionList,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from '@react-navigation/native';

import {
  fetchSecondaryStock,
  fetchPrices,
  sellSecondary,
  saveCart as persistCart,
  fetchSavedCarts,
  fetchCartItems,
} from '../../src/db';
import type { Article, Price } from '../../src/db';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

type CartItem = {
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

type SavedCartDetail = {
  client: string;
  total: number;
  items: CartItem[];
};

export default function CartScreen() {
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? 'light'];

  const [brazilStock, setBrazilStock]   = useState<Article[]>([]);
  const [prices, setPrices]             = useState<Price[]>([]);
  const [clientModalVisible, setClientModalVisible] = useState(false);
  const [clientName, setClientName]               = useState('');
  const [isBuilding, setIsBuilding]               = useState(false);

  const [selection, setSelection]     = useState<Record<number,string>>({});
  const [savedCarts, setSavedCarts]   = useState<SavedSummary[]>([]);
  const [detailModal, setDetailModal] = useState<SavedCartDetail|null>(null);

  const loadData = useCallback(async () => {
    try {
      const [br, pr, saved] = await Promise.all([
        fetchSecondaryStock(),
        fetchPrices(),
        fetchSavedCarts(),
      ]);
      setBrazilStock(br);
      setPrices(pr);
      setSavedCarts(saved);
    } catch (e: any) {
      Alert.alert('Load failed', e.message);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const priceMap = useMemo(() => {
    const m: Record<number,number> = {};
    prices.forEach(p => { m[p.article_id] = p.price; });
    return m;
  }, [prices]);

  const currentItems: CartItem[] = useMemo(() => {
    return brazilStock
      .map(a => {
        const raw = selection[a.id];
        const qty = parseInt(raw||'0', 10);
        if (qty > 0) {
          return {
            id:        a.id,
            name:      a.name,
            quantity:  qty,
            unitPrice: priceMap[a.id]||0,
            available: a.quantity,
          };
        }
        return null;
      })
      .filter((x): x is CartItem => !!x);
  }, [selection, brazilStock, priceMap]);

  const currentTotal = useMemo(
    () => currentItems.reduce((sum,it)=>sum + it.quantity*it.unitPrice, 0),
    [currentItems]
  );

  const shareReceipt = async (cart: SavedCartDetail) => {
    const rows = cart.items.map(it => `
      <tr>
        <td>${it.name}</td>
        <td style="text-align:center">${it.quantity}</td>
        <td style="text-align:right">${it.unitPrice.toFixed(2)}</td>
        <td style="text-align:right">${(it.quantity*it.unitPrice).toFixed(2)}</td>
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

  const saveCart = async () => {
    if (!clientName.trim()) {
      return Alert.alert('Please enter client name');
    }
    if (currentItems.length === 0) {
      return Alert.alert('No items selected');
    }
    try {
      // 1) remove from Brazil stock
      await Promise.all(
        currentItems.map(it => sellSecondary(it.id, it.quantity))
      );
      // 2) persist in DB
      await persistCart(
        clientName.trim(),
        currentItems.map(it => ({
          article_id: it.id,
          quantity:   it.quantity,
          price:      it.unitPrice
        }))
      );
      // 3) reload all data
      await loadData();
      // 4) reset UI
      setClientName('');
      setSelection({});
      setIsBuilding(false);
    } catch (e: any) {
      Alert.alert('Error saving cart', e.message);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.select({ ios: 'padding' })}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.heading, { color: theme.primary }]}>Carts</Text>
          <TouchableOpacity
            onPress={() => setClientModalVisible(true)}
            style={[styles.addBtn, { backgroundColor: theme.accent }]}
          >
            <MaterialIcons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {isBuilding ? (
          <View style={styles.builder}>
            <Text style={[styles.subheading, { color: theme.primary }]}>
              Client: {clientName}
            </Text>
            <ScrollView style={styles.list}>
              {brazilStock.map(a => {
                const raw = selection[a.id];
                const qty = parseInt(raw||'0',10);
                const checked = raw !== undefined;
                return (
                  <View key={a.id}
                    style={[
                      styles.card,
                      { backgroundColor: theme.card, shadowColor: theme.shadow }
                    ]}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        setSelection(sel => {
                          const c = { ...sel };
                          if (c[a.id] != null) delete c[a.id];
                          else c[a.id] = '1';
                          return c;
                        });
                      }}
                    >
                      <MaterialIcons
                        name={checked ? 'check-box' : 'check-box-outline-blank'}
                        size={24}
                        color={theme.primary}
                      />
                    </TouchableOpacity>

                    <Text style={[styles.itemName, { color: theme.text }]}>
                      {a.name}
                    </Text>

                    <Text style={[styles.cell, { color: theme.text }]}>
                      Avail: {a.quantity}
                    </Text>

                    <Text style={[styles.cell, { color: theme.text }]}>
                      ${(priceMap[a.id]||0).toFixed(2)}
                    </Text>

                    <TextInput
                      style={[
                        styles.smallInput,
                        {
                          borderColor: theme.border,
                          color: theme.text,
                          backgroundColor: theme.background,
                        },
                      ]}
                      keyboardType="numeric"
                      editable={checked}
                      value={raw}
                      onChangeText={t =>
                        setSelection(sel => ({ ...sel, [a.id]: t }))
                      }
                    />
                  </View>
                );
              })}
            </ScrollView>

            <View
              style={[
                styles.footer,
                { borderColor: theme.border, backgroundColor: theme.card },
              ]}
            >
              <Text style={[styles.footerText, { color: theme.text }]}>
                Total: ${currentTotal.toFixed(2)}
              </Text>
              <View style={styles.footerButtons}>
                <TouchableOpacity
                  onPress={saveCart}
                  style={[styles.btn, { backgroundColor: theme.accent }]}
                >
                  <Text style={styles.btnText}>Save Cart</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    shareReceipt({
                      client: clientName,
                      total: currentTotal,
                      items: currentItems,
                    })
                  }
                  style={[styles.btn, { backgroundColor: theme.accent }]}
                >
                  <Text style={styles.btnText}>Share PDF</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <SectionList
            sections={[{ title: 'Saved', data: savedCarts }]}
            keyExtractor={(item) => item.id.toString()}
            renderSectionHeader={() =>
              savedCarts.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.placeholder }]}>
                  No carts yet. Tap + to create one.
                </Text>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.card,
                  { backgroundColor: theme.card, shadowColor: theme.shadow },
                ]}
                onPress={async () => {
                  const lines = await fetchCartItems(item.id);
                  setDetailModal({
                    client: item.client,
                    total: item.total,
                    items: lines.map(l => ({
                      id:        l.article_id,
                      name:      l.name,
                      quantity:  l.quantity,
                      unitPrice: l.price,
                      available: 0,
                    })),
                  });
                }}
              >
                <Text style={[styles.cardText, { color: theme.text }]}>
                  {item.client}
                </Text>
                <Text style={[styles.cell, { color: theme.text }]}>
                  ${item.total.toFixed(2)}
                </Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.list}
          />
        )}

        {/* Client Name Modal */}
        <Modal visible={clientModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modal,
                { backgroundColor: theme.card, shadowColor: theme.shadow },
              ]}
            >
              <Text style={[styles.modalTitle, { color: theme.primary }]}>
                Enter Client Name
              </Text>
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    borderColor: theme.border,
                    color: theme.text,
                    backgroundColor: theme.background,
                  },
                ]}
                placeholder="Client Name"
                placeholderTextColor={theme.placeholder}
                value={clientName}
                onChangeText={setClientName}
              />
              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setClientModalVisible(false)}
                  style={styles.modalBtn}
                >
                  <Text>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (!clientName.trim()) {
                      Alert.alert('Please enter a name');
                      return;
                    }
                    setClientModalVisible(false);
                    setIsBuilding(true);
                  }}
                  style={[styles.modalBtn, { backgroundColor: theme.accent }]}
                >
                  <Text style={{ color: '#fff' }}>OK</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Detail Modal */}
        <Modal visible={!!detailModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modal,
                { backgroundColor: theme.card, shadowColor: theme.shadow },
              ]}
            >
              <Text style={[styles.modalTitle, { color: theme.primary }]}>
                {detailModal?.client}
              </Text>
              <ScrollView style={{ maxHeight: '60%' }}>
                {detailModal?.items.map((it, i) => (
                  <View key={i} style={styles.card}>
                    <Text style={[styles.cardText, { color: theme.text }]}>
                      {it.name}
                    </Text>
                    <Text style={[styles.cell, { color: theme.text }]}>
                      {it.quantity}
                    </Text>
                    <Text style={[styles.cell, { color: theme.text }]}>
                      ${it.unitPrice.toFixed(2)}
                    </Text>
                    <Text style={[styles.cell, { color: theme.text }]}>
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1 },
  headerRow:      { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginHorizontal:16,marginTop:32 },
  heading:        { fontSize:28, fontWeight:'bold', marginVertical:16 },
  addBtn:         { padding:8, borderRadius:6 },
  builder:        { flex:1 },
  subheading:     { fontSize:20, fontWeight:'600', marginHorizontal:16, marginBottom:8 },
  list:           { paddingBottom:16 },
  card:           {
    flexDirection:'row',
    alignItems:'center',
    padding:12,
    marginHorizontal:16,
    marginVertical:4,
    borderRadius:10,
    elevation:2,
    shadowOffset:{width:0,height:1},
    shadowOpacity:0.2,
  },
  cardText:       { flex:1, fontSize:16 },
  cell:           { width:80, textAlign:'center', fontSize:16, marginHorizontal:8 },
  itemName:       { flex:1, fontSize:16, marginHorizontal:8 },
  smallInput:     {
    width:50,
    borderWidth:1,
    borderRadius:6,
    padding:4,
    textAlign:'center',
    marginHorizontal:8,
  },
  btn:            { padding:6, borderRadius:6 },
  footer:         {
    borderTopWidth:1,
    padding:12,
    marginHorizontal:16,
  },
  footerText:     { fontSize:18, fontWeight:'600', marginVertical:4 },
  footerButtons:  { flexDirection:'row', justifyContent:'space-between', marginTop:8 },
  btnText:        { color:'#fff', fontWeight:'600' },
  modalOverlay:   {
    flex:1,
    backgroundColor:'rgba(0,0,0,0.5)',
    justifyContent:'center',
    alignItems:'center',
  },
  modal:          {
    width:'80%',
    padding:16,
    borderRadius:8,
    elevation:4,
  },
  modalTitle:     { fontSize:18, fontWeight:'600', marginBottom:12 },
  modalInput:     {
    borderWidth:1,
    borderRadius:6,
    padding:8,
    fontSize:16,
    marginBottom:16,
  },
  modalActions:   { flexDirection:'row', justifyContent:'flex-end' },
  modalBtn:       { padding:10, borderRadius:6, marginLeft:12 },
  emptyText:      { textAlign:'center', marginTop:32 },
});
