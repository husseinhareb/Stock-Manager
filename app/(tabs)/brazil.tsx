// app/(tabs)/brazil.tsx
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  SectionList,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  Keyboard,
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

type SectionType = 'move' | 'view';
interface SectionData {
  title: string;
  data: Article[];
  type: SectionType;
}

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

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

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

  const sections: SectionData[] = [
    {
      title: 'China Stock',
      data: mainStock.filter(a => a.quantity > 0),
      type: 'move'
    },
    {
      title: 'Brazil Stock',
      data: brazilStock.filter(a => a.quantity > 0),
      type: 'view'
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.container}
        behavior={Platform.select({ ios: 'padding' })}>
        <Text style={[styles.heading, { color: theme.primary }]}>Brazil Stock</Text>

        <SectionList
          sections={sections}
          keyExtractor={item => item.id.toString()}
          renderSectionHeader={({ section }) => (
            <Text style={[styles.subheader, { color: theme.primary }]}>
              {section.title}
            </Text>
          )}
          renderItem={({ item, section }) => {
            const unit = priceMap[item.id] || 0;
            const total = (unit * item.quantity).toFixed(2);
            return (
              <View style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
                <Text style={[styles.cardText, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                <View style={[styles.badge, { backgroundColor: theme.accent }]}>
                  <Text style={styles.badgeText}>{item.quantity}</Text>
                </View>
                {section.type === 'view' && (
                  <>
                    <Text style={[styles.cell, { color: theme.text }]}>{`$${unit.toFixed(2)}`}</Text>
                    <Text style={[styles.cell, { color: theme.text }]}>{`$${total}`}</Text>
                  </>
                )}
                <View style={styles.actions}>
                  <TextInput
                    style={[styles.smallInput, { borderColor: theme.border, color: theme.text }]}
                    placeholder={section.type === 'move' ? 'Qty' : 'Ret'}
                    placeholderTextColor={theme.placeholder}
                    keyboardType="numeric"
                    value={section.type === 'move' ? moveQty[item.id] : returnQty[item.id]}
                    onChangeText={t => section.type === 'move'
                      ? setMoveQty(m => ({ ...m, [item.id]: t }))
                      : setReturnQty(m => ({ ...m, [item.id]: t }))
                    }
                  />
                  <TouchableOpacity
                    onPress={() => section.type === 'move' ? onMove(item) : onReturn(item)}
                    style={[styles.actionBtn, { backgroundColor: section.type === 'move' ? theme.primary : theme.accent }]}
                  >
                    <FontAwesome name={section.type === 'move' ? 'arrow-right' : 'arrow-left'} size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          renderSectionFooter={({ section }) => {
            if (section.type === 'move') {
              return (
                <View style={styles.sectionFooter}>
                  <Text style={[styles.footerText, { color: theme.text }]}>
                    <FontAwesome name="cubes" size={20} color={theme.primary} />
                    Total China Articles: {mainTotalQty}
                  </Text>
                </View>
              );
            }
            return null;
          }}
          contentContainerStyle={styles.list}
          ListFooterComponent={() => (
            <View style={[styles.footerContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.footerItem}>
                <FontAwesome name="cubes" size={20} color={theme.primary} />
                <Text style={[styles.footerText, { color: theme.text }]}>Total Brazil Articles: {brazilTotalQty}</Text>
              </View>
              <View style={styles.footerItem}>
                <FontAwesome name="dollar" size={20} color={theme.primary} />
                <Text style={[styles.footerText, { color: theme.text }]}>Total Brazil Value: ${brazilTotalVal.toFixed(2)}</Text>
              </View>
            </View>
          )}
        />

        {/* Price Modal */}
        <Modal visible={priceModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
              <Text style={[styles.modalTitle, { color: theme.primary }]}>Set price for “{priceModalArticle?.name}”</Text>
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
                <Pressable onPress={onSavePrice} style={[styles.modalBtn, { backgroundColor: theme.primary }]}>
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
  container: { flex: 1, padding: 16 },
  heading: { fontSize: 30, fontWeight: 'bold', marginBottom: 12 },
  subheader: { fontSize: 22, fontWeight: '700', marginVertical: 8 },
  list: { paddingBottom: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginVertical: 8,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  icon: { marginRight: 12 },
  cardText: { flex: 1, fontSize: 18, fontWeight: '600' },
  badge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cell: { width: 70, textAlign: 'center', fontSize: 16, marginHorizontal: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  smallInput: {
    width: 60,
    borderWidth: 1,
    borderRadius: 6,
    padding: 6,
    marginRight: 8,
    textAlign: 'center',
  },
  actionBtn: { padding: 8, borderRadius: 6 },
  sectionFooter: {
    paddingVertical: 8,
    borderTopWidth: 1,
    marginVertical: 8,
  },
  footerContainer: {
    padding: 16,
    borderTopWidth: 1,
    marginTop: 16,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  footerItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  footerText: { fontSize: 16, fontWeight: '600', marginLeft: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    padding: 20,
    borderRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    marginBottom: 20,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  modalBtn: { padding: 12, borderRadius: 8, marginLeft: 12 },
});
