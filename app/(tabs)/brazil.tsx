// app/(tabs)/brazil.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import {
  fetchMainStock,
  fetchSecondaryStock,
  fetchPrices,
  moveToSecondary,
  setPrice,
  returnToMain,
} from '../../src/db';
import type { Article, Price } from '../../src/db';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

export default function BrazilStockScreen() {
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? 'light'];

  const [mainStock, setMainStock] = useState<Article[]>([]);
  const [brazilStock, setBrazilStock] = useState<Article[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);

  const [moveQty, setMoveQty] = useState<Record<number, string>>({});
  const [returnQty, setReturnQty] = useState<Record<number, string>>({});

  const [priceModalVisible, setPriceModalVisible] = useState(false);
  const [priceModalArticle, setPriceModalArticle] = useState<Article | null>(null);
  const [priceInput, setPriceInput] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [main, br, pr] = await Promise.all([
        fetchMainStock(),
        fetchSecondaryStock(),
        fetchPrices(),
      ]);
      setMainStock(main);
      setBrazilStock(br);
      setPrices(pr);
    } catch (e: any) {
      Alert.alert('Error loading data', e.message);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(useCallback(() => {
    loadData();
  }, [loadData]));

  const priceMap = useMemo(() => {
    const m: Record<number, number> = {};
    prices.forEach(p => { m[p.article_id] = p.price });
    return m;
  }, [prices]);

  const mainTotalQty = useMemo(
    () => mainStock.reduce((s, a) => s + a.quantity, 0),
    [mainStock]
  );
  const brazilTotalQty = useMemo(
    () => brazilStock.reduce((s, a) => s + a.quantity, 0),
    [brazilStock]
  );
  const brazilTotalVal = useMemo(
    () => brazilStock.reduce((s, a) => s + a.quantity * (priceMap[a.id] || 0), 0),
    [brazilStock, priceMap]
  );

  const onMove = async (item: Article) => {
    const q = parseInt(moveQty[item.id] || '0', 10);
    if (q <= 0) return Alert.alert('Enter a positive quantity to move');
    try {
      await moveToSecondary(item.id, q);
      setMoveQty(m => ({ ...m, [item.id]: '' }));
      setPriceModalArticle(item);
      setPriceInput('');
      setPriceModalVisible(true);
    } catch (e: any) {
      Alert.alert('Move failed', e.message);
    }
  };

  const onReturn = async (item: Article) => {
    const q = parseInt(returnQty[item.id] || '0', 10);
    if (q <= 0) return Alert.alert('Enter a positive quantity to return');
    try {
      await returnToMain(item.id, q);
      setReturnQty(m => ({ ...m, [item.id]: '' }));
      await loadData();
    } catch (e: any) {
      Alert.alert('Return failed', e.message);
    }
  };

  const onSavePrice = async () => {
    if (!priceModalArticle) return;
    const p = parseFloat(priceInput);
    if (isNaN(p) || p < 0) return Alert.alert('Invalid price');
    try {
      await setPrice(priceModalArticle.id, p);
      setPriceModalVisible(false);
      await loadData();
    } catch (e: any) {
      Alert.alert('Save price failed', e.message);
    }
  };

  const renderMoveItem = ({ item }: { item: Article }) => (
    <View style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
      <Text style={[styles.cardText, { color: theme.text }]} numberOfLines={1}>
        {item.name}
      </Text>
      <View style={[styles.badge, { backgroundColor: theme.accent }]}>
        <Text style={styles.badgeText}>{item.quantity}</Text>
      </View>
      <View style={styles.actions}>
        <TextInput
          style={[styles.smallInput, { borderColor: theme.border, color: theme.text }]}
          placeholder="Qty"
          placeholderTextColor={theme.placeholder}
          keyboardType="numeric"
          value={moveQty[item.id]}
          onChangeText={t => setMoveQty(m => ({ ...m, [item.id]: t }))}
        />
        <TouchableOpacity
          onPress={() => onMove(item)}
          style={[styles.actionBtn, { backgroundColor: theme.primary }]}
        >
          <FontAwesome name="arrow-right" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderViewItem = ({ item }: { item: Article }) => {
    const unit = priceMap[item.id] || 0;
    const total = (unit * item.quantity).toFixed(2);
    return (
      <View style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
        <Text style={[styles.cardText, { color: theme.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={[styles.badge, { backgroundColor: theme.accent }]}>
          <Text style={styles.badgeText}>{item.quantity}</Text>
        </View>
        <Text style={[styles.cell, { color: theme.text }]}>{`$${unit.toFixed(2)}`}</Text>
        <Text style={[styles.cell, { color: theme.text }]}>{`$${total}`}</Text>
        <View style={styles.actions}>
          <TextInput
            style={[styles.smallInput, { borderColor: theme.border, color: theme.text }]}
            placeholder="Ret"
            placeholderTextColor={theme.placeholder}
            keyboardType="numeric"
            value={returnQty[item.id]}
            onChangeText={t => setReturnQty(m => ({ ...m, [item.id]: t }))}
          />
          <TouchableOpacity
            onPress={() => onReturn(item)}
            style={[styles.actionBtn, { backgroundColor: '#FF3B30' }]}
          >
            <FontAwesome name="arrow-left" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.select({ ios: 'padding' })}
      >
        <Text style={[styles.heading, { color: theme.primary }]}>Stocks</Text>

        {/* ─── China Stock Panel ─────────────────────────── */}
        <View style={styles.sectionContainer}>
          <Text style={[styles.subheader, { color: theme.primary }]}>China Stock</Text>
          <FlatList
            data={mainStock.filter(a => a.quantity > 0)}
            keyExtractor={item => item.id.toString()}
            renderItem={renderMoveItem}
            style={styles.listScroll}
            contentContainerStyle={{ paddingBottom: 8 }}
          />
          <View style={styles.sectionFooter}>
            <FontAwesome name="cubes" size={18} color={theme.primary} />
            <Text style={[styles.footerText, { color: theme.text, marginLeft: 6 }]}>
              Total: {mainTotalQty}
            </Text>
          </View>
        </View>

        {/* ─── Brazil Stock Panel ────────────────────────── */}
        <View style={styles.sectionContainer}>
          <Text style={[styles.subheader, { color: theme.primary }]}>Brazil Stock</Text>
          <FlatList
            data={brazilStock.filter(a => a.quantity > 0)}
            keyExtractor={item => item.id.toString()}
            renderItem={renderViewItem}
            style={styles.listScroll}
            contentContainerStyle={{ paddingBottom: 8 }}
          />
          <View style={styles.sectionFooter}>
            <FontAwesome name="cubes" size={18} color={theme.primary} />
            <Text style={[styles.footerText, { color: theme.text, marginLeft: 6 }]}>
              Total Qty: {brazilTotalQty}
            </Text>
            <FontAwesome
              name="dollar"
              size={18}
              color={theme.primary}
              style={{ marginLeft: 16 }}
            />
            <Text style={[styles.footerText, { color: theme.text, marginLeft: 6 }]}>
              Value: ${brazilTotalVal.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* ─── Price Modal ───────────────────────────────── */}
        <Modal visible={priceModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View
              style={[styles.modalContent, { backgroundColor: theme.card, shadowColor: theme.shadow }]}
            >
              <Text style={[styles.modalTitle, { color: theme.primary }]}>
                Set price for “{priceModalArticle?.name}”
              </Text>
              <TextInput
                style={[styles.modalInput, { borderColor: theme.border, color: theme.text }]}
                placeholder="Unit Price"
                placeholderTextColor={theme.placeholder}
                keyboardType="numeric"
                value={priceInput}
                onChangeText={setPriceInput}
                onSubmitEditing={onSavePrice}
              />
              <View style={styles.modalActions}>
                <Pressable onPress={() => setPriceModalVisible(false)} style={styles.modalBtn}>
                  <Text style={{ color: theme.text }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={onSavePrice}
                  style={[styles.modalBtn, { backgroundColor: theme.primary }]}
                >
                  <Text style={{ color: '#fff' }}>Save</Text>
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
  container: { flex: 1, padding: 12 },
  heading: { fontSize: 28, fontWeight: 'bold', marginBottom: 12 },
  sectionContainer: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 12,
  },
  subheader: { fontSize: 20, fontWeight: '600', padding: 8 },
  listScroll: { flex: 1, paddingHorizontal: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginVertical: 4,
    borderRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  cardText: { flex: 1, fontSize: 16, fontWeight: '500' },
  badge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cell: { width: 60, textAlign: 'center', fontSize: 16, marginHorizontal: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  smallInput: {
    width: 50,
    borderWidth: 1,
    borderRadius: 6,
    padding: 4,
    marginRight: 6,
    textAlign: 'center',
  },
  actionBtn: { padding: 6, borderRadius: 6 },
  sectionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderTopWidth: 1,
  },
  footerText: { fontSize: 16, fontWeight: '600' },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    padding: 16,
    borderRadius: 8,
    elevation: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    fontSize: 16,
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  modalBtn: { padding: 10, borderRadius: 6, marginLeft: 8 },
});
