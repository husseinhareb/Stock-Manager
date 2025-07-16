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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  fetchMainStock,
  fetchSecondaryStock,
  moveToSecondary,
  sellSecondary,
} from '../../src/db';
import type { Article } from '../../src/db';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

type SectionType = 'move' | 'sell';
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
  const [moveQty, setMoveQty] = useState<Record<number,string>>({});
  const [sellQty, setSellQty] = useState<Record<number,string>>({});

  const loadData = useCallback(async () => {
    try {
      const [main, br] = await Promise.all([
        fetchMainStock(),
        fetchSecondaryStock(),
      ]);
      setMainStock(main);
      setBrazilStock(br);
    } catch (e: any) {
      Alert.alert('Error loading stocks', e.message);
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

  const mainTotal = useMemo(
    () => mainStock.reduce((sum, a) => sum + a.quantity, 0),
    [mainStock]
  );
  const brazilTotal = useMemo(
    () => brazilStock.reduce((sum, a) => sum + a.quantity, 0),
    [brazilStock]
  );

  const onMove = async (item: Article) => {
    const q = parseInt(moveQty[item.id] || '0', 10);
    if (q <= 0) {
      return Alert.alert('Enter a positive quantity to move');
    }
    try {
      await moveToSecondary(item.id, q);
      setMoveQty(m => ({ ...m, [item.id]: '' }));
      await loadData();
    } catch (e: any) {
      Alert.alert('Error moving stock', e.message);
    }
  };

  const onSell = async (item: Article) => {
    const q = parseInt(sellQty[item.id] || '0', 10);
    if (q <= 0) {
      return Alert.alert('Enter a positive quantity to sell');
    }
    try {
      await sellSecondary(item.id, q);
      setSellQty(m => ({ ...m, [item.id]: '' }));
      await loadData();
    } catch (e: any) {
      Alert.alert('Error selling stock', e.message);
    }
  };

  const sections: SectionData[] = [
    { title: 'Main Stock (China)', data: mainStock, type: 'move' },
    { title: 'Brazil Stock',       data: brazilStock, type: 'sell' },
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
          renderSectionHeader={({ section }) => {
            const total = section.type === 'move' ? mainTotal : brazilTotal;
            return (
              <Text style={[styles.subheader, { color: theme.primary }]}>
                {section.title} — Total: {total}
              </Text>
            );
          }}
          renderItem={({ item, section }) => {
            const isMove = section.type === 'move';
            return (
              <View style={styles.row}>
                <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
                <Text style={[styles.count, { color: theme.text }]}>{item.quantity}</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.text }]}
                  placeholder="Qty"
                  placeholderTextColor={theme.placeholder}
                  keyboardType="numeric"
                  value={isMove ? moveQty[item.id] : sellQty[item.id]}
                  onChangeText={t => {
                    if (isMove) setMoveQty(m => ({ ...m, [item.id]: t }));
                    else        setSellQty(s => ({ ...s, [item.id]: t }));
                  }}
                />
                <TouchableOpacity
                  onPress={() => isMove ? onMove(item) : onSell(item)}
                  style={[
                    styles.btn,
                    { backgroundColor: isMove ? theme.accent : '#FF3B30' },
                  ]}
                >
                  <MaterialIcons
                    name={isMove ? 'arrow-forward-ios' : 'sell'}
                    size={20}
                    color="#fff"
                  />
                </TouchableOpacity>
              </View>
            );
          }}
          contentContainerStyle={styles.list}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading:   { fontSize: 28, fontWeight: 'bold', margin: 16 },
  subheader: { fontSize: 22, fontWeight: 'bold', marginTop: 12, marginHorizontal: 16 },
  list:      { paddingBottom: 16 },
  row:       {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 4,
  },
  name:      { flex: 2, fontSize: 16 },
  count:     { width: 50, textAlign: 'center', fontSize: 16 },
  input:     {
    width: 60,
    borderWidth: 1,
    borderRadius: 4,
    padding: 4,
    marginHorizontal: 8,
  },
  btn:       { padding: 6, borderRadius: 4 },
});
