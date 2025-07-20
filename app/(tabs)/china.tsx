// app/(tabs)/china.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  Text,
  View,
  StyleSheet,
  TextInput,
  FlatList,
  Platform,
  KeyboardAvoidingView,
  TouchableOpacity,
  Modal,
  Pressable,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import {
  initDB,
  addArticle,
  fetchArticles,
  fetchTotalQuantity,
  updateArticle,
  deleteArticle,
  Article,
} from '../../src/db';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

export default function ChinaStockScreen() {
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? 'light'];
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<null | Article>(null);
  const [editName, setEditName] = useState('');
  const [editQuantity, setEditQuantity] = useState('');

  useEffect(() => {
    initDB().catch(console.warn);
  }, []);

  const loadData = useCallback(async () => {
    const list = await fetchArticles();
    setArticles(list);
    setTotal(await fetchTotalQuantity());
  }, []);

  useEffect(() => {
    loadData().catch(console.warn);
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData().catch(console.warn);
    }, [loadData])
  );

  const handleAdd = () => {
    const qty = parseInt(quantity, 10);
    if (!name.trim() || isNaN(qty) || qty < 0) return;
    addArticle(name.trim(), qty)
      .then(() => {
        setName('');
        setQuantity('');
        Keyboard.dismiss();
        loadData();
      })
      .catch(console.warn);
  };

  const startEdit = (item: Article) => {
    setEditing(item);
    setEditName(item.name);
    setEditQuantity(item.quantity.toString());
  };

  const handleSaveEdit = () => {
    if (!editing) return;
    const qty = parseInt(editQuantity, 10);
    if (!editName.trim() || isNaN(qty) || qty < 0) return;
    updateArticle(editing.id, editName.trim(), qty)
      .then(() => {
        setEditing(null);
        loadData();
      })
      .catch(console.warn);
  };

  const handleDelete = (id: number) => {
    deleteArticle(id)
      .then(() => loadData())
      .catch(console.warn);
  };

  const renderItem = ({ item }: { item: Article }) => (
    <View style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
      <Text style={[styles.cardText, { color: theme.text }]}>{item.name}</Text>
      <View style={styles.badge}>
        <Text style={[styles.badgeText, { color: theme.badgeText }]}>{item.quantity}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => startEdit(item)} style={styles.actionBtn}>
          <MaterialIcons name="edit" size={20} color={theme.icon} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionBtn}>
          <MaterialIcons name="delete" size={20} color={theme.icon} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <>
      <SafeAreaView
        edges={['top', 'left', 'right']}
        style={{ flex: 1, backgroundColor: theme.background }}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.select({ ios: 'padding' })}>
          <View style={styles.form}>
            <View style={[styles.inputWrapper, { borderColor: theme.border }]}>
              <MaterialIcons name="inventory" size={20} color={theme.icon} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder={t('china.placeholder.name')}
                placeholderTextColor={theme.placeholder}
                value={name}
                onChangeText={setName}
              />
            </View>
            <View style={[styles.inputWrapper, { borderColor: theme.border }]}>
              <MaterialIcons name="pinch" size={20} color={theme.icon} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder={t('china.placeholder.quantity')}
                placeholderTextColor={theme.placeholder}
                keyboardType="numeric"
                value={quantity}
                onChangeText={setQuantity}
              />
            </View>
            <TouchableOpacity onPress={handleAdd} style={[styles.fabAdd, { backgroundColor: theme.accent }]}>
              <MaterialIcons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={articles.filter(a => a.quantity > 0)}
            keyExtractor={item => item.id.toString()}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: theme.placeholder }]}>
                {t('china.empty')}
              </Text>
            }
          />

          <View style={[styles.footer, { backgroundColor: theme.footer }]}>
            <Text style={[styles.totalLabel, { color: theme.text }]}>{t('china.total')}</Text>
            <Text style={[styles.totalValue, { color: theme.primary }]}>{total}</Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal visible={!!editing} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
            <Text style={[styles.modalTitle, { color: theme.primary }]}>
              {t('china.editTitle')}
            </Text>

            <TextInput
              style={[styles.modalInput, { borderColor: theme.border, color: theme.text }]}
              value={editName}
              onChangeText={setEditName}
              placeholder={t('china.placeholder.name')}
              placeholderTextColor={theme.placeholder}
            />
            <TextInput
              style={[styles.modalInput, { borderColor: theme.border, color: theme.text }]}
              value={editQuantity}
              onChangeText={setEditQuantity}
              placeholder={t('china.placeholder.quantity')}
              placeholderTextColor={theme.placeholder}
              keyboardType="numeric"
            />

            <View style={styles.modalActions}>
              <Pressable onPress={() => setEditing(null)} style={styles.modalBtn}>
                <Text>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={handleSaveEdit} style={[styles.modalBtn, { backgroundColor: theme.accent }]}>
                <Text style={{ color: '#fff' }}>{t('china.save')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 28, fontWeight: 'bold', margin: 16 },
  form: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16 },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    marginRight: 8,
  },
  inputIcon: { marginRight: 4 },
  input: { flex: 1, height: 40 },
  fabAdd: { padding: 12, borderRadius: 8 },
  list: { padding: 16, paddingBottom: 120 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    elevation: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
  },
  cardText: { flex: 1, fontSize: 16 },
  badge: { backgroundColor: '#eee', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontWeight: 'bold' },
  actions: { flexDirection: 'row', marginLeft: 12 },
  actionBtn: { marginLeft: 8 },
  emptyText: { textAlign: 'center', marginTop: 32 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
  },
  totalLabel: { fontSize: 16 },
  totalValue: { fontSize: 20, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', borderRadius: 8, padding: 16 },
  modalTitle: { fontSize: 20, marginBottom: 12 },
  modalInput: { borderWidth: 1, borderRadius: 6, padding: 8, marginBottom: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  modalBtn: { padding: 10, borderRadius: 6, marginLeft: 12 },
});
