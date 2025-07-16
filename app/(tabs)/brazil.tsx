// app/(tabs)/brazil.tsx
import React, { useEffect, useState, useCallback } from 'react';
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
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import {
  fetchMainStock,
  fetchSecondaryStock,
  moveToSecondary,
  sellSecondary,
} from '../../src/db';
import type { Article } from '../../src/db';

type SectionType = 'move' | 'sell';
interface SectionData {
  title: string;
  data: Article[];
  type: SectionType;
}

export default function BrazilStockScreen() {
  const [mainStock, setMainStock]     = useState<Article[]>([]);
  const [brazilStock, setBrazilStock] = useState<Article[]>([]);
  const [moveQty, setMoveQty]         = useState<Record<number,string>>({});
  const [sellQty, setSellQty]         = useState<Record<number,string>>({});

  // load function
  const load = useCallback(async () => {
    const [main, br] = await Promise.all([
      fetchMainStock(),
      fetchSecondaryStock(),
    ]);
    setMainStock(main);
    setBrazilStock(br);
  }, []);

  // on mount
  useEffect(() => {
    load().catch(err => Alert.alert('Error loading stocks', err.message));
  }, [load]);

  // on focus (when navigating back here)
  useFocusEffect(
    useCallback(() => {
      load().catch(err => Alert.alert('Error loading stocks', err.message));
    }, [load])
  );

  const onMove = async (item: Article) => {
    const q = parseInt(moveQty[item.id]||'0',10);
    if (q <= 0) {
      return Alert.alert('Enter a positive quantity to move');
    }
    try {
      await moveToSecondary(item.id, q);
      setMoveQty(m => ({ ...m, [item.id]: '' }));
      await load();
    } catch (e: any) {
      Alert.alert('Error moving stock', e.message);
    }
  };

  const onSell = async (item: Article) => {
    const q = parseInt(sellQty[item.id]||'0',10);
    if (q <= 0) {
      return Alert.alert('Enter a positive quantity to sell');
    }
    try {
      await sellSecondary(item.id, q);
      setSellQty(m => ({ ...m, [item.id]: '' }));
      await load();
    } catch (e: any) {
      Alert.alert('Error selling stock', e.message);
    }
  };

  const sections: SectionData[] = [
    { title: 'Main Stock (China)', data: mainStock, type: 'move' },
    { title: 'Brazil Stock',       data: brazilStock, type: 'sell' },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding' })}
    >
      <SectionList
        sections={sections}
        keyExtractor={item => item.id.toString()}
        renderSectionHeader={({ section }) => (
          <Text style={styles.header}>{section.title}</Text>
        )}
        renderItem={({ item, section }) => {
          const isMove = section.type === 'move';
          return (
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.count}>{item.quantity}</Text>
              <TextInput
                style={styles.input}
                placeholder="Qty"
                keyboardType="numeric"
                value={isMove ? moveQty[item.id] : sellQty[item.id]}
                onChangeText={t => {
                  if (isMove) setMoveQty(m => ({ ...m, [item.id]: t }));
                  else        setSellQty(s => ({ ...s, [item.id]: t }));
                }}
              />
              <TouchableOpacity
                onPress={() => isMove ? onMove(item) : onSell(item)}
                style={[styles.btn, !isMove && styles.btnSell]}
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
        contentContainerStyle={styles.content}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content:   { padding: 8 },
  header:    { fontSize: 22, fontWeight: 'bold', marginVertical: 8 },
  row:       { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  name:      { flex: 2, fontSize: 16 },
  count:     { width: 50, textAlign: 'center', fontSize: 16 },
  input:     {
    width: 60,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 4,
    marginHorizontal: 4,
  },
  btn:       { backgroundColor: '#007AFF', padding: 6, borderRadius: 4 },
  btnSell:   { backgroundColor: '#FF3B30' },
});
