import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  fetchCart, fetchCartTotal, removeFromCart, clearCart, CartItem,
} from '../../src/db';

export default function CartScreen() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [filter, setFilter] = useState('');
  const [total, setTotal] = useState(0);

  useEffect(() => {
    (async () => {
      setCart(await fetchCart());
      setTotal(await fetchCartTotal());
    })();
  }, []);

  const filtered = cart.filter(c =>
    c.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.filter}
        placeholder="Filter…"
        value={filter}
        onChangeText={setFilter}
      />
      <FlatList
        data={filtered}
        keyExtractor={item => item.article_id.toString()}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.count}>{item.quantity}</Text>
            <Text style={styles.count}>
              {(item.price * item.quantity).toFixed(2)}
            </Text>
            <TouchableOpacity
              onPress={async () => {
                await removeFromCart(item.article_id);
                const updated = await fetchCart();
                setCart(updated);
                setTotal(await fetchCartTotal());
              }}
              style={styles.deleteBtn}
            >
              <MaterialIcons name="delete" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      />
      <View style={styles.footer}>
        <Text style={styles.total}>Total: {total.toFixed(2)}</Text>
        <View style={styles.actions}>
          <TouchableOpacity /* PDF logic here */ style={styles.btn}>
            <Text style={styles.btnText}>PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              await clearCart();
              setCart([]);
              setTotal(0);
            }}
            style={styles.deleteBtn}
          >
            <Text style={styles.btnText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 8 },
  filter: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 4,
    padding: 8, marginBottom: 8,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 6,
  },
  name: { flex: 2 },
  count: { width: 50, textAlign: 'center' },
  deleteBtn: {
    backgroundColor: '#E74C3C', padding: 6, borderRadius: 4,
  },
  footer: { paddingVertical: 12, borderTopWidth: 1, borderColor: '#ddd' },
  total: { fontSize: 18, fontWeight: 'bold' },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  btn: { backgroundColor: '#007AFF', padding: 8, borderRadius: 4 },
  btnText: { color: '#fff' },
});
