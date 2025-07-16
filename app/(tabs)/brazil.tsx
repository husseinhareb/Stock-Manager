// app/(tabs)/brazil.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import MapView, { Marker, LatLng } from 'react-native-maps';
import { MaterialIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import {
  fetchMainStock,
  fetchSecondaryStock,
  moveToSecondary,
  sellSecondary,
  fetchPrices,
  setPrice,
  fetchCart,
  addToCart,
  removeFromCart,
  clearCart,
  fetchCartTotal,
  fetchClients,
  addClient,
  Article,
  Price,
  CartItem,
  ClientPin,
} from '../../src/db';

export default function BrazilStockScreen() {
  // Stocks
  const [mainStock, setMainStock]       = useState<Article[]>([]);
  const [brazilStock, setBrazilStock]   = useState<Article[]>([]);
  const [moveQty, setMoveQty]           = useState<Record<number,string>>({});
  const [sellQty, setSellQty]           = useState<Record<number,string>>({});
  // Prices
  const [prices, setPrices]             = useState<Price[]>([]);
  const [priceInputs, setPriceInputs]   = useState<Record<number,string>>({});
  // Cart
  const [cart, setCart]                 = useState<CartItem[]>([]);
  const [cartQty, setCartQty]           = useState<Record<number,string>>({});
  const [cartFilter, setCartFilter]     = useState('');
  const [cartTotal, setCartTotal]       = useState(0);
  // Map / Clients
  const [clients, setClients]           = useState<ClientPin[]>([]);
  const [mapModal, setMapModal]         = useState(false);
  const [pinName, setPinName]           = useState('');
  const [pinCoords, setPinCoords]       = useState<LatLng|null>(null);

  useEffect(() => {
    reloadAll();
  }, []);

  async function reloadAll() {
    setMainStock(await fetchMainStock());
    setBrazilStock(await fetchSecondaryStock());
    setPrices(await fetchPrices());
    setCart(await fetchCart());
    setCartTotal(await fetchCartTotal());
    setClients(await fetchClients());
  }

  // Move & Sell
  async function onMove(item: Article) {
    const qty = parseInt(moveQty[item.id]||'0',10);
    if (qty<=0) return Alert.alert('Enter a valid quantity');
    try {
      await moveToSecondary(item.id, qty);
      setMoveQty(prev=>({...prev,[item.id]:''}));
      reloadAll();
    } catch(e:any){ Alert.alert('Error', e.message); }
  }
  async function onSell(item: Article) {
    const qty = parseInt(sellQty[item.id]||'0',10);
    if (qty<=0) return Alert.alert('Enter a valid quantity');
    try {
      await sellSecondary(item.id, qty);
      setSellQty(prev=>({...prev,[item.id]:''}));
      reloadAll();
    } catch(e:any){ Alert.alert('Error', e.message); }
  }

  // Price
  async function onSavePrice(aid: number) {
    const val = parseFloat(priceInputs[aid]||'0');
    if (isNaN(val)||val<0) return Alert.alert('Invalid price');
    await setPrice(aid, val);
    reloadAll();
  }

  // Cart
  async function onAddCart(item: Article) {
    const qty = parseInt(cartQty[item.id]||'0',10);
    if (qty<=0) return Alert.alert('Enter valid qty');
    await addToCart(item.id, qty);
    setCart(await fetchCart());
    setCartTotal(await fetchCartTotal());
    setCartQty(prev=>({...prev,[item.id]:''}));
  }
  async function onRemoveCart(ci: CartItem) {
    await removeFromCart(ci.article_id);
    setCart(await fetchCart());
    setCartTotal(await fetchCartTotal());
  }
  async function onClearCart() {
    await clearCart();
    setCart([]);
    setCartTotal(0);
  }
  async function onPrint() {
    const html = `
      <h1>Receipt</h1>
      <table border="1" cellpadding="5">
        <tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
        ${cart.map(c=>`
          <tr>
            <td>${c.name}</td>
            <td>${c.quantity}</td>
            <td>${c.price.toFixed(2)}</td>
            <td>${(c.quantity*c.price).toFixed(2)}</td>
          </tr>
        `).join('')}
        <tr>
          <td colspan="3"><strong>Grand Total</strong></td>
          <td><strong>${cartTotal.toFixed(2)}</strong></td>
        </tr>
      </table>
    `;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri);
  }

  // Map
  function onMapPress(e:any) {
    setPinCoords(e.nativeEvent.coordinate);
    setPinName('');
    setMapModal(true);
  }
  async function onSavePin() {
    if (!pinCoords||!pinName.trim()) return;
    await addClient(pinName.trim(), pinCoords.latitude, pinCoords.longitude);
    setMapModal(false);
    reloadAll();
  }

  // Render helpers omitted for brevity…

  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.select({ ios:'padding' })}>
      <ScrollView style={styles.container}>
        {/* Main Stock */}
        <Text style={styles.header}>Main Stock (China)</Text>
        <FlatList
          data={mainStock}
          keyExtractor={i=>i.id.toString()}
          renderItem={({item})=>(
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.count}>{item.quantity}</Text>
              <TextInput
                style={styles.smallInput}
                value={moveQty[item.id]||''}
                onChangeText={t=>setMoveQty(prev=>({...prev,[item.id]:t}))}
                placeholder="Move"
                keyboardType="numeric"
              />
              <TouchableOpacity onPress={()=>onMove(item)} style={styles.btn}>
                <MaterialIcons name="chevron-right" size={20} color="#fff"/>
              </TouchableOpacity>
            </View>
          )}
        />

        {/* Brazil Stock */}
        <Text style={styles.header}>Brazil Stock</Text>
        <FlatList
          data={brazilStock}
          keyExtractor={i=>i.id.toString()}
          renderItem={({item})=>(
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.count}>{item.quantity}</Text>
              <TextInput
                style={styles.smallInput}
                value={sellQty[item.id]||''}
                onChangeText={t=>setSellQty(prev=>({...prev,[item.id]:t}))}
                placeholder="Sell"
                keyboardType="numeric"
              />
              <TouchableOpacity onPress={()=>onSell(item)} style={[styles.btn,styles.btnSell]}>
                <MaterialIcons name="sell" size={20} color="#fff"/>
              </TouchableOpacity>
            </View>
          )}
        />

        {/* Pricing */}
        <Text style={styles.header}>Prices</Text>
        <FlatList
          data={prices}
          keyExtractor={p=>p.article_id.toString()}
          renderItem={({item})=>{
            const art = mainStock.find(a=>a.id===item.article_id);
            return (
              <View style={styles.row}>
                <Text style={styles.name}>{art?.name}</Text>
                <TextInput
                  style={styles.smallInput}
                  value={priceInputs[item.article_id] ?? item.price.toString()}
                  onChangeText={t=>setPriceInputs(prev=>({...prev,[item.article_id]:t}))}
                  placeholder="Price"
                  keyboardType="numeric"
                />
                <TouchableOpacity onPress={()=>onSavePrice(item.article_id)} style={styles.btn}>
                  <MaterialIcons name="save" size={20} color="#fff"/>
                </TouchableOpacity>
              </View>
            );
          }}
        />

        {/* Cart */}
        <Text style={styles.header}>Cart</Text>
        <TextInput
          style={styles.filter}
          placeholder="Filter..."
          value={cartFilter}
          onChangeText={setCartFilter}
        />
        <FlatList
          data={cart.filter(c=>c.name.toLowerCase().includes(cartFilter.toLowerCase()))}
          keyExtractor={c=>c.article_id.toString()}
          renderItem={({item})=>(
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.count}>{item.quantity}</Text>
              <Text style={styles.count}>{(item.price*item.quantity).toFixed(2)}</Text>
              <TouchableOpacity onPress={()=>onRemoveCart(item)} style={styles.btnDelete}>
                <MaterialIcons name="delete" size={20} color="#fff"/>
              </TouchableOpacity>
            </View>
          )}
        />
        <Text style={styles.total}>Total: {cartTotal.toFixed(2)}</Text>
        <View style={styles.cartActions}>
          <TouchableOpacity onPress={onPrint} style={styles.btn}>
            <Text style={styles.btnText}>PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClearCart} style={styles.btnDelete}>
            <Text style={styles.btnText}>Clear</Text>
          </TouchableOpacity>
        </View>

        {/* Map */}
        <Text style={styles.header}>Client Map</Text>
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: -14.2350,
            longitude: -51.9253,
            latitudeDelta: 10,
            longitudeDelta: 10,
          }}
          onPress={onMapPress}
        >
          {clients.map(c=>(
            <Marker
              key={c.id}
              coordinate={{latitude:c.latitude,longitude:c.longitude}}
              title={c.name}
            />
          ))}
        </MapView>
      </ScrollView>

      {/* Add Client Modal */}
      <Modal visible={mapModal} transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TextInput
              style={styles.modalInput}
              placeholder="Client name"
              value={pinName}
              onChangeText={setPinName}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={()=>setMapModal(false)} style={styles.modalBtn}>
                <Text>Cancel</Text>
              </Pressable>
              <Pressable onPress={onSavePin} style={[styles.modalBtn,styles.btn]}>
                <Text style={styles.btnText}>Add</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 8, backgroundColor: '#fff' },
  header: { fontSize: 22, fontWeight: 'bold', marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  name: { flex: 2 },
  count: { width: 50, textAlign: 'center' },
  smallInput: {
    width: 60,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 4,
    marginHorizontal: 4,
  },
  btn: { backgroundColor: '#007AFF', padding: 6, borderRadius: 4 },
  btnSell: { backgroundColor: '#FF3B30' },
  btnDelete: { backgroundColor: '#E74C3C', padding: 6, borderRadius: 4 },
  btnText: { color: '#fff' },
  filter: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
  },
  total: { fontSize: 18, fontWeight: 'bold', marginVertical: 8 },
  cartActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  map: { height: 300, marginVertical: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 8,
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalBtn: {
    padding: 8,
    marginLeft: 8,
    borderRadius: 4,
  },
});
