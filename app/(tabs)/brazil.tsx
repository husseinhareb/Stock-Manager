// app/(tabs)/brazil.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import {
  fetchMainStock,
  fetchSecondaryStock,
  fetchPrices,
  moveToSecondary,
  setPrice,
  returnToMain,
  getSetting,
} from '../../src/db';
import type { Article, Price } from '../../src/db';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

export default function BrazilStockScreen() {
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? 'light'];
  const { t } = useTranslation();

  // --- new: currency state & symbol map ---
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const SYMBOLS: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£',
    JPY: '¥', CAD: 'C$', AUD: 'A$',
    CHF: 'CHF', CNY: '¥', BRL: 'R$'
  };

  // Load currency setting when component mounts
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
      Alert.alert(t('brazil.alert.loadError'), e.message);
    }
  }, [t]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const priceMap = useMemo(() => {
    const m: Record<number, number> = {};
    prices.forEach(p => { m[p.article_id] = p.price });
    return m;
  }, [prices]);

  const mainTotalQty = useMemo(() => mainStock.reduce((s, a) => s + a.quantity, 0), [mainStock]);
  const brazilTotalQty = useMemo(() => brazilStock.reduce((s, a) => s + a.quantity, 0), [brazilStock]);
  const brazilTotalVal = useMemo(
    () => brazilStock.reduce((s, a) => s + a.quantity * (priceMap[a.id] || 0), 0),
    [brazilStock, priceMap]
  );

  const onMove = async (item: Article) => {
    const q = parseInt(moveQty[item.id] || '0', 10);
    if (q <= 0) return Alert.alert(t('brazil.alert.invalidMove'));
    try {
      await moveToSecondary(item.id, q);
      setMoveQty(prev => ({ ...prev, [item.id]: '' }));
      setPriceModalArticle(item);
      setPriceInput('');
      setPriceModalVisible(true);
    } catch (e: any) {
      Alert.alert(t('brazil.alert.moveFailed'), e.message);
    }
  };

  const onReturn = async (item: Article) => {
    const q = parseInt(returnQty[item.id] || '0', 10);
    if (q <= 0) return Alert.alert(t('brazil.alert.invalidReturn'));
    try {
      await returnToMain(item.id, q);
      setReturnQty(prev => ({ ...prev, [item.id]: '' }));
      await loadData();
    } catch (e: any) {
      Alert.alert(t('brazil.alert.returnFailed'), e.message);
    }
  };

  const onSavePrice = async () => {
    if (!priceModalArticle) return;
    const p = parseFloat(priceInput);
    if (isNaN(p) || p < 0) return Alert.alert(t('brazil.alert.invalidPrice'));
    try {
      await setPrice(priceModalArticle.id, p);
      setPriceModalVisible(false);
      await loadData();
    } catch (e: any) {
      Alert.alert(t('brazil.alert.saveFailed'), e.message);
    }
  };

  const renderMoveItem = ({ item }: { item: Article }) => (
    <Pressable style={({ pressed }) => [
      styles.card,
      { backgroundColor: theme.card, shadowColor: theme.shadow },
      pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }
    ]}>
      <FontAwesome name="archive" size={20} color={theme.accent} style={styles.icon} />
      <Text style={[styles.cardText, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
      <View style={[styles.badge, { backgroundColor: theme.accent }]}>
        <Text style={styles.badgeText}>{item.quantity}</Text>
      </View>
      <TextInput
        style={[styles.smallInput, { borderColor: theme.border, color: theme.text }]}
        placeholder={t('brazil.placeholder.qty')}
        placeholderTextColor={theme.placeholder}
        keyboardType="numeric"
        value={moveQty[item.id]}
        onChangeText={t => setMoveQty(m => ({ ...m, [item.id]: t }))}
      />
      <Pressable onPress={() => onMove(item)} style={[styles.solidBtn, { backgroundColor: theme.primary }]}>
        <FontAwesome name="arrow-right" size={16} color="#fff" />
      </Pressable>
    </Pressable>
  );

  const renderViewItem = ({ item }: { item: Article }) => {
    const unit = priceMap[item.id] || 0;
    const total = (unit * item.quantity).toFixed(2);
    return (
      <Pressable style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.card, shadowColor: theme.shadow },
        pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }
      ]}>
        <FontAwesome name="archive" size={20} color={theme.accent} style={styles.icon} />
        <Text style={[styles.cardText, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
        <View style={[styles.badge, { backgroundColor: theme.accent }]}>
          <Text style={styles.badgeText}>{item.quantity}</Text>
        </View>
        <Text style={{ width: 60, textAlign: 'center', color: theme.text, fontSize: 16 }}>
          {`${currencySymbol}${unit.toFixed(2)}`}
        </Text>
        <Text style={{ width: 60, textAlign: 'center', color: theme.text, fontSize: 16 }}>
          {`${currencySymbol}${total}`}
        </Text>
        <TextInput
          style={[styles.smallInput, { borderColor: theme.border, color: theme.text }]}
          placeholder={t('brazil.placeholder.ret')}
          placeholderTextColor={theme.placeholder}
          keyboardType="numeric"
          value={returnQty[item.id]}
          onChangeText={t => setReturnQty(m => ({ ...m, [item.id]: t }))}
        />
        <Pressable onPress={() => onReturn(item)} style={[styles.solidBtn, { backgroundColor: '#FF5F6D' }]}>
          <FontAwesome name="arrow-left" size={16} color="#fff" />
        </Pressable>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.select({ ios: 'padding' })}>
        <View style={[styles.sectionContainer, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('brazil.chinaStock')}</Text>
          <FlatList
            data={mainStock.filter(a => a.quantity > 0)}
            keyExtractor={i => i.id.toString()}
            renderItem={renderMoveItem}
            style={styles.listScroll}
            showsVerticalScrollIndicator={false}
          />
          <View style={[styles.footerBar, { borderTopColor: theme.border }]}>
            <FontAwesome name="cubes" size={18} color={theme.accent} />
            <Text style={[styles.footerText, { color: theme.text }]}>{t('brazil.footer.items', { count: mainTotalQty })}</Text>
          </View>
        </View>

        <View style={[styles.sectionContainer, { backgroundColor: theme.card }]}>
          <Text style={[styles.heading, { color: theme.primary }]}>{t('brazil.brazilStock')}</Text>
          <FlatList
            data={brazilStock.filter(a => a.quantity > 0)}
            keyExtractor={i => i.id.toString()}
            renderItem={renderViewItem}
            style={styles.listScroll}
            showsVerticalScrollIndicator={false}
          />
          <View style={[styles.footerBar, { borderTopColor: theme.border }]}>
            <FontAwesome name="cubes" size={18} color={theme.accent} />
            <Text style={[styles.footerText, { color: theme.text }]}>{t('brazil.footer.pcs', { count: brazilTotalQty })}</Text>
            <FontAwesome name="dollar" size={18} color={theme.accent} style={{ marginLeft: 20 }} />
            <Text style={[styles.footerText, { color: theme.text }]}>{`${currencySymbol}${brazilTotalVal.toFixed(2)}`}</Text>
          </View>
        </View>

        <Modal visible={priceModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
              <Text style={[styles.modalTitle, { color: theme.primary }]}>
                {t('brazil.setPrice', { name: priceModalArticle?.name })}
              </Text>
              <TextInput
                style={[styles.modalInput, { borderColor: theme.border, color: theme.text }]}
                placeholder={t('brazil.placeholder.unitPrice')}
                placeholderTextColor={theme.placeholder}
                keyboardType="numeric"
                value={priceInput}
                onChangeText={setPriceInput}
                onSubmitEditing={onSavePrice}
              />
              <View style={styles.modalActions}>
                <Pressable onPress={() => setPriceModalVisible(false)} style={styles.modalBtn}>
                  <Text style={{ color: theme.text, fontWeight: '600' }}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable onPress={onSavePrice} style={[styles.modalBtn, { backgroundColor: theme.primary }]}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>{t('common.save')}</Text>
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
  container: { flex: 1 },
  heading: { fontSize: 28, fontWeight: 'bold', margin: 16 },

  header: { fontSize: 28, fontWeight: 'bold', marginBottom: 12 },
  headerText: {
    fontSize: 28,
    fontWeight: '800',
  },

  sectionContainer: {
    flex: 1,
    margin: 12,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    letterSpacing: 0.5,
  },
  listScroll: { flex: 1, paddingHorizontal: 12 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginVertical: 6,
    marginHorizontal: 4,
    borderRadius: 12,
    backgroundColor: '#FFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  icon: { marginRight: 10 },
  cardText: { flex: 1, fontSize: 16, fontWeight: '600' },
  badge: { padding: 6, borderRadius: 8 },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cell: { width: 60, textAlign: 'center', fontSize: 16 },
  smallInput: {
    width: 50,
    borderWidth: 1,
    borderRadius: 8,
    padding: 6,
    marginHorizontal: 8,
    textAlign: 'center',
  },
  solidBtn: {
    padding: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  footerText: { fontSize: 16, fontWeight: '700', marginLeft: 8 },

  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    elevation: 6,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: '#FFF',
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginLeft: 12,
  },
});
