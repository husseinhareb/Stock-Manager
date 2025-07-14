// app/(tabs)/china.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Platform,
  KeyboardAvoidingView,
  TouchableOpacity,
  Keyboard,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { initDB, addArticle, fetchArticles, fetchTotalQuantity } from '../../src/db';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

type Article = { id: number; name: string; quantity: number };

export default function ChinaStockScreen() {
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? 'light'];

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    initDB().then(loadData).catch(console.warn);
  }, []);

  const loadData = () => {
    fetchArticles().then(setArticles).catch(console.warn);
    fetchTotalQuantity().then(setTotal).catch(console.warn);
  };

  const handleAdd = () => {
    const qty = parseInt(quantity, 10);
    if (name.trim() && !isNaN(qty)) {
      addArticle(name.trim(), qty)
        .then(() => {
          setName('');
          setQuantity('');
          Keyboard.dismiss();
          loadData();
        })
        .catch(console.warn);
    }
  };

  const renderItem = ({ item }: { item: Article }) => (
    <View style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
      <Text style={[styles.cardText, { color: theme.text }]}>
        {item.name}
      </Text>
      <View style={styles.badge}>
        <Text style={[styles.badgeText, { color: theme.badgeText }]}>
          {item.quantity}
        </Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <Text style={[styles.heading, { color: theme.primary }]}>
        China Stock
      </Text>

      <View style={styles.form}>
        <View style={[styles.inputWrapper, { borderColor: theme.border }]}>
          <MaterialIcons name="inventory" size={20} color={theme.icon} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            placeholder="Article name"
            placeholderTextColor={theme.placeholder}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={[styles.inputWrapper, { borderColor: theme.border }]}>
          <MaterialIcons name="pinch" size={20} color={theme.icon} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            placeholder="Quantity"
            placeholderTextColor={theme.placeholder}
            value={quantity}
            keyboardType="numeric"
            onChangeText={setQuantity}
          />
        </View>
      </View>

      <FlatList
        data={articles}
        keyExtractor={item => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: theme.placeholder }]}>
            No articles yet. Tap + to add.
          </Text>
        }
      />

      <View style={[styles.footer, { backgroundColor: theme.footer }]}>
        <Text style={[styles.totalLabel, { color: theme.text }]}>
          Total Quantity
        </Text>
        <Text style={[styles.totalValue, { color: theme.primary }]}>
          {total}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.accent, shadowColor: theme.shadow }]}
        onPress={handleAdd}
        activeOpacity={0.7}
      >
        <MaterialIcons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 28, fontWeight: 'bold', margin: 16 },
  form: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16 },
  inputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, marginHorizontal: 4 },
  inputIcon: { marginRight: 4 },
  input: { flex: 1, height: 40 },
  list: { padding: 16, paddingBottom: 120 },
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, marginBottom: 12, elevation: 3, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3 },
  cardText: { fontSize: 16 },
  badge: { backgroundColor: '#eee', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 14, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', marginTop: 32, fontSize: 16 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderTopWidth: 1 },
  totalLabel: { fontSize: 16 },
  totalValue: { fontSize: 20, fontWeight: 'bold' },
  fab: { position: 'absolute', bottom: 80, right: 24, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 4 },
});
