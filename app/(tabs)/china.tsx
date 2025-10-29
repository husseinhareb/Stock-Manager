// src/screens/(tabs)/china.tsx
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { SafeAreaView } from 'react-native-safe-area-context';
import XLSX from 'xlsx';

import {
  addArticle,
  Article,
  deleteArticle,
  fetchArticles,
  fetchTotalQuantity,
  initDB,
  reorderArticles,
  updateArticle,
} from '@/src/db';
import { Colors } from '@constants/Colors';
import { useColorScheme } from '@hooks/useColorScheme';

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
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    initDB().catch(console.warn);
  }, []);

  const loadData = useCallback(async () => {
    const list = await fetchArticles();
    setArticles(list);
    setTotal(await fetchTotalQuantity());
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData().catch(console.warn);
    setRefreshing(false);
  }, [loadData]);

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

  // Excel import: pick file, parse ITEM/QTY columns, insert rows
  const handleImport = useCallback(async () => {
    try {
      setIsImporting(true);
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const file = res.assets?.[0];
      if (!file) return;

      // Read as base64 then parse with XLSX
      const b64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
      const wb = XLSX.read(b64, { type: 'base64' });
      const firstSheetName = wb.SheetNames[0];
      const ws = wb.Sheets[firstSheetName];
      if (!ws) throw new Error('No worksheet found');

      // Convert sheet to 2D array for flexible header detection
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as any[];
      if (!rows.length) throw new Error('Sheet is empty');

      // Find header row containing ITEM and QTY (case-insensitive, spaces tolerant)
      let headerRowIndex = -1;
      let itemCol = -1;
      let qtyCol = -1;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        for (let c = 0; c < row.length; c++) {
          const cell = String(row[c] ?? '').trim().toLowerCase();
          if (cell === 'item') {
            itemCol = c;
          }
          if (cell === 'qty' || cell === 'quantity') {
            qtyCol = c;
          }
        }
        if (itemCol !== -1 && qtyCol !== -1) {
          headerRowIndex = r;
          break;
        } else {
          itemCol = -1; qtyCol = -1; // reset and continue searching
        }
      }
      if (headerRowIndex === -1) throw new Error('Could not find ITEM and QTY headers');

      // Parse data rows after header
      const toInsert: { name: string; quantity: number }[] = [];
      for (let r = headerRowIndex + 1; r < rows.length; r++) {
        const row = rows[r];
        const nameRaw = String(row[itemCol] ?? '').trim();
        const name = nameRaw;

        // Stop parsing on TOTAL, EOF or IP PACKING markers (case-insensitive)
        const low = name.toLowerCase().replace(/[:\s]+$/, '');
        if (low === 'total' || low === 'eof' || low.includes('packing')) break;

        const qtyRaw = row[qtyCol];
        if (!name) continue;
        const qty = Number(qtyRaw);
        if (!Number.isFinite(qty)) continue;
        if (qty <= 0) continue;
        toInsert.push({ name, quantity: Math.floor(qty) });
      }

      if (!toInsert.length) {
        Alert.alert(t('china.import.title', { defaultValue: 'Import' }), t('china.import.empty', { defaultValue: 'No valid rows found.' }));
        return;
      }

      // Insert sequentially to preserve write lock semantics with progress tracking
      setImportProgress({ current: 0, total: toInsert.length });
      for (let i = 0; i < toInsert.length; i++) {
        const row = toInsert[i];
        try {
          await addArticle(row.name, row.quantity);
          setImportProgress({ current: i + 1, total: toInsert.length });
        } catch (e) {
          // continue on individual failure, but log
          console.warn('Failed to insert row', row, e);
        }
      }

      await loadData();
      Alert.alert(
        t('china.import.title', { defaultValue: 'Import' }),
        t('china.import.success', { defaultValue: `Imported ${toInsert.length} different items.` })
      );
    } catch (e: any) {
      Alert.alert(t('china.import.title', { defaultValue: 'Import' }), e.message || String(e));
    } finally {
      setIsImporting(false);
      setImportProgress({ current: 0, total: 0 });
    }
  }, [loadData, t]);

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

  const confirmDelete = (item: Article) => {
    Alert.alert(
      t('china.confirmDelete.title'),
      t('china.confirmDelete.message', { name: item.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { 
          text: t('common.delete'), 
          style: 'destructive',
          onPress: () => handleDelete(item.id)
        }
      ]
    );
  };

  const handleDelete = (id: number) => {
    deleteArticle(id)
      .then(() => loadData())
      .catch(console.warn);
  };

  const visibleArticles = useMemo(() => {
    let filtered = articles.filter(a => a.quantity > 0);
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a => 
        a.name.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [articles, searchQuery]);

  const visibleTotal = useMemo(() => {
    return visibleArticles.reduce((sum, article) => sum + article.quantity, 0);
  }, [visibleArticles]);

  const commitReorder = useCallback(
    (newVisibleOrder: Article[]) => {
      const newVisibleIdQueue = newVisibleOrder.map(a => a.id);
      const fullOrderedIds: number[] = [];

      for (const a of articles) {
        if (a.quantity > 0) {
          fullOrderedIds.push(newVisibleIdQueue.shift()!);
        } else {
          fullOrderedIds.push(a.id);
        }
      }

      reorderArticles(fullOrderedIds)
        .then(() => loadData())
        .catch(console.warn);

      setArticles(prev => {
        const idToPos = new Map<number, number>();
        fullOrderedIds.forEach((id, idx) => idToPos.set(id, idx + 1));
        const merged = prev.map(a => ({ ...a, position: idToPos.get(a.id) ?? a.position }));
        return merged.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      });
    },
    [articles, loadData]
  );

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<Article>) => (
      <Pressable
        onLongPress={drag}
        delayLongPress={200}
        style={[
          styles.card,
          { backgroundColor: theme.card, shadowColor: theme.shadow, borderColor: theme.border, opacity: isActive ? 0.9 : 1 },
        ]}
      >
        <Text style={[styles.cardText, { color: theme.text }]} numberOfLines={1}>
          {item.name}
        </Text>

        <View style={styles.badge}>
          <Text style={[styles.badgeText, { color: theme.badgeText }]}>{item.quantity}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={() => startEdit(item)} style={styles.actionBtn}>
            <MaterialIcons name="edit" size={20} color={theme.icon} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => confirmDelete(item)} style={styles.actionBtn}>
            <MaterialIcons name="delete" size={20} color={theme.icon} />
          </TouchableOpacity>
        </View>
      </Pressable>
    ),
    [theme]
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
            <TouchableOpacity disabled={isImporting} onPress={handleImport} style={[styles.fabAdd, { backgroundColor: isImporting ? '#aaa' : theme.primary, marginLeft: 8 }]}>
              <MaterialIcons name="file-upload" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View style={[styles.searchContainer, { backgroundColor: theme.background }]}>
            <View style={[styles.searchWrapper, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <MaterialIcons name="search" size={20} color={theme.icon} style={styles.searchIcon} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder={t('china.searchPlaceholder')}
                placeholderTextColor={theme.placeholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                  <MaterialIcons name="close" size={18} color={theme.icon} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <DraggableFlatList
            data={visibleArticles}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderItem}
            onDragEnd={({ data }) => commitReorder(data)}
            activationDistance={8}
            containerStyle={{ flex: 1 }}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: theme.placeholder }]}>
                {searchQuery ? t('china.noResults') : t('china.empty')}
              </Text>
            }
          />

          <View style={[styles.footer, { backgroundColor: theme.footer, borderColor: theme.border }]}>
            <Text style={[styles.totalLabel, { color: theme.text }]}>{t('china.total')}</Text>
            <Text style={[styles.totalValue, { color: theme.primary }]}>{visibleTotal}</Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => { setEditing(null); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background, borderColor: theme.border }]}>
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
                <Text style={{ color: theme.accent, fontWeight: '600' }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={handleSaveEdit} style={[styles.modalBtn, { backgroundColor: theme.accent }]}>
                <Text style={{ color: '#fff' }}>{t('china.save')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Loading Overlay */}
      {isImporting && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={styles.loadingText}>{t('china.importing')}</Text>
            {importProgress.total > 0 && (
              <Text style={styles.loadingProgress}>
                {importProgress.current} / {importProgress.total}
              </Text>
            )}
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 28,
    fontWeight: '800',
    margin: 16,
    letterSpacing: 0.2,
  },
  form: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 10,
    backgroundColor: 'rgba(127,127,127,0.06)',
  },
  inputIcon: { marginRight: 8, opacity: 0.85 },
  input: { flex: 1, height: 44, fontSize: 16, fontWeight: '600', letterSpacing: 0.2 },
  fabAdd: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  searchIcon: {
    marginRight: 8,
    opacity: 0.7,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    height: 40,
  },
  clearBtn: {
    padding: 4,
    borderRadius: 12,
  },
  list: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 120 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 14,
    marginBottom: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dragHandle: { paddingVertical: 6, paddingHorizontal: 6, marginRight: 6, borderRadius: 8 },
  cardText: { flex: 1, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  badge: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: 'rgba(127,127,127,0.15)', marginLeft: 8 },
  badgeText: { fontWeight: '800', letterSpacing: 0.2 },
  actions: { flexDirection: 'row', marginLeft: 12 },
  actionBtn: { marginLeft: 10, padding: 6, borderRadius: 10 },
  emptyText: { textAlign: 'center', marginTop: 36, fontSize: 15, opacity: 0.7 },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  totalLabel: { fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  totalValue: { fontSize: 22, fontWeight: '900', letterSpacing: 0.3 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  modalContent: {
    width: '88%', borderRadius: 16, padding: 18, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.18, shadowRadius: 24, borderWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 12, letterSpacing: 0.2 },
  modalInput: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12, fontSize: 16, marginBottom: 12, backgroundColor: 'rgba(127,127,127,0.06)', fontWeight: '600' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, marginLeft: 12 },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  loadingBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    minWidth: 200,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    letterSpacing: 0.2,
  },
  loadingProgress: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
});

