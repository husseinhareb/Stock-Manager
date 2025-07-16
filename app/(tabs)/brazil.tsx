// app/(tabs)/brazil.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  fetchMainStock,
  fetchSecondaryStock,
  fetchPrices,
  moveToSecondary,
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

  const [mainStock, setMainStock]     = useState<Article[]>([]);
  const [brazilStock, setBrazilStock] = useState<Article[]>([]);
  const [prices, setPrices]           = useState<Price[]>([]);
  const [moveQty, setMoveQty]         = useState<Record<number,string>>({});
  const [priceModalVisible, setPriceModalVisible] = useState(false);
  const [priceModalArticle, setPriceModalArticle] = useState<Article|null>(null);
  const [priceInput, setPriceInput]   = useState('');

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

  // map article_id → price
  const priceMap = useMemo(() => {
    const m: Record<number, number> = {};
    prices.forEach(p => {
      m[p.article_id] = p.price;
    });
    return m;
  }, [prices]);

  // totals
  const mainTotalQty   = useMemo(() => mainStock.reduce((sum,a)=>sum+a.quantity, 0), [mainStock]);
  const brazilTotalQty = useMemo(() => brazilStock.reduce((sum,a)=>sum+a.quantity, 0), [brazilStock]);
  const brazilTotalVal = useMemo(() =>
    brazilStock.reduce((sum,a)=>sum + a.quantity*(priceMap[a.id]||0), 0),
    [brazilStock, priceMap]
  );

  const onMove = async (item: Article) => {
    const q = parseInt(moveQty[item.id]||'0',10);
    if (q <= 0) {
      return Alert.alert('Enter a positive quantity to move');
    }
    try {
      await moveToSecondary(item.id, q);
      setMoveQty(m=>({...m,[item.id]:''}));
      // prompt for price
      setPriceModalArticle(item);
      setPriceInput('');
      setPriceModalVisible(true);
    } catch (e: any) {
      Alert.alert('Error moving stock', e.message);
    }
  };

  const onSavePrice = async () => {
    if (!priceModalArticle) return;
    const p = parseFloat(priceInput);
    if (isNaN(p) || p < 0) return Alert.alert('Invalid price');
    try {
      await fetchPrices(); // ensure price table exists
      await import('../../src/db').then(db => db.setPrice(priceModalArticle.id, p));
      setPriceModalVisible(false);
      await loadData();
    } catch (e: any) {
      Alert.alert('Error saving price', e.message);
    }
  };

  const sections: SectionData[] = [
    { title: `Main Stock (China) — Total: ${mainTotalQty}`, data: mainStock, type: 'move' },
    { title: `Brazil Stock — Qty: ${brazilTotalQty} • Value: ${brazilTotalVal.toFixed(2)}`, data: brazilStock, type: 'view' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.select({ ios: 'padding' })}
      >
        <Text style={[styles.heading, { color: theme.primary }]}>
          Brazil Stock
        </Text>

        <SectionList
          sections={sections}
          keyExtractor={item => item.id.toString()}
          renderSectionHeader={({ section }) => (
            <Text style={[styles.subheader, { color: theme.primary }]}>
              {section.title}
            </Text>
          )}
          renderItem={({ item, section }) => {
            if (section.type === 'move') {
              return (
                <View style={styles.row}>
                  <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
                  <Text style={[styles.count, { color: theme.text }]}>{item.quantity}</Text>
                  <TextInput
                    style={[styles.input, { borderColor: theme.border, color: theme.text }]}
                    placeholder="Qty"
                    placeholderTextColor={theme.placeholder}
                    keyboardType="numeric"
                    value={moveQty[item.id]}
                    onChangeText={t => setMoveQty(m=>({...m,[item.id]:t}))}
                  />
                  <TouchableOpacity
                    onPress={()=>onMove(item)}
                    style={[styles.btn, { backgroundColor: theme.accent }]}
                  >
                    <MaterialIcons name="arrow-forward-ios" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              );
            } else {
              const price = priceMap[item.id]||0;
              const total = item.quantity * price;
              return (
                <View style={styles.viewRow}>
                  <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
                  <Text style={[styles.count, { color: theme.text }]}>{item.quantity}</Text>
                  <Text style={[styles.count, { color: theme.text }]}>{price.toFixed(2)}</Text>
                  <Text style={[styles.count, { color: theme.text }]}>{total.toFixed(2)}</Text>
                </View>
              );
            }
          }}
          contentContainerStyle={styles.list}
        />

        {/* Price Modal */}
        <Modal visible={priceModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
              <Text style={[styles.modalTitle, { color: theme.primary }]}>
                Set price for "{priceModalArticle?.name}"
              </Text>
              <TextInput
                style={[styles.modalInput, { borderColor: theme.border, color: theme.text }]}
                placeholder="Price"
                placeholderTextColor={theme.placeholder}
                keyboardType="numeric"
                value={priceInput}
                onChangeText={setPriceInput}
              />
              <View style={styles.modalActions}>
                <Pressable onPress={()=>setPriceModalVisible(false)} style={styles.modalBtn}>
                  <Text>Cancel</Text>
                </Pressable>
                <Pressable onPress={onSavePrice} style={[styles.modalBtn, { backgroundColor: theme.accent }]}>
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
  container:    { flex: 1 },
  heading:      { fontSize: 28, fontWeight: 'bold', margin: 16 },
  subheader:    { fontSize: 22, fontWeight: 'bold', marginVertical: 8, marginHorizontal: 16 },
  list:         { paddingBottom: 16 },
  row:          { flexDirection:'row', alignItems:'center', marginHorizontal:16, marginVertical:4 },
  viewRow:      { flexDirection:'row', alignItems:'center', marginHorizontal:16, marginVertical:4 },
  name:         { flex:2, fontSize:16 },
  count:        { width:60, textAlign:'center', fontSize:16 },
  input:        { width:60, borderWidth:1, borderRadius:4, padding:4, marginHorizontal:8 },
  btn:          { padding:6, borderRadius:4 },
  modalOverlay: {
    flex:1, backgroundColor:'rgba(0,0,0,0.3)',
    justifyContent:'center', alignItems:'center'
  },
  modalContent: {
    width:'80%', padding:16, borderRadius:8
  },
  modalTitle:   { fontSize:20, marginBottom:12 },
  modalInput:   { borderWidth:1, borderRadius:6, padding:8, marginBottom:12 },
  modalActions: { flexDirection:'row', justifyContent:'flex-end' },
  modalBtn:     { padding:10, borderRadius:6, marginLeft:12 }
});
