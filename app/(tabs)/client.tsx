// src/screens/(tabs)/client.tsx
import type { Article, Price } from '@/src/db';
import {
  deleteSavedClient,
  fetchClientItems,
  fetchPrices,
  fetchSavedClients,
  fetchSecondaryStock,
  getSetting,
  saveClient as persistClient,
  sellSecondary,
} from '@/src/db';
import { Colors } from '@constants/Colors';
import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { useColorScheme } from '@hooks/useColorScheme';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ClientItem = {
  id: number;
  name: string;
  quantity: number;
  unitPrice: number;
  available: number;
};

type SavedSummary = {
  id: number;
  client: string;
  created_at: number;
  total: number;
};

type SavedClientDetail = {
  id: number;
  client: string;
  total: number;
  items: ClientItem[];
  created_at?: number;
};
type ReceiptPayload = { client: string; total: number; items: ClientItem[] };

export default function ClientScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? 'light'];

  const [currencyCode, setCurrencyCode] = useState('USD');
  const [currencySymbol, setCurrencySymbol] = useState('$');

  const SYMBOLS: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF', CNY: '¥', BRL: 'R$',
  };

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

  const [brazilStock, setBrazilStock] = useState<Article[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [savedClients, setSavedClients] = useState<SavedSummary[]>([]);
  const [selection, setSelection] = useState<Record<number, string>>({});
  const [clientName, setClientName] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [clientModalVisible, setClientModalVisible] = useState(false);
  const [detailModal, setDetailModal] = useState<SavedClientDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [qtyWarnings, setQtyWarnings] = useState<Record<number, string>>({});

  // Clear search when switching between modes
  useEffect(() => {
    setSearchQuery('');
  }, [isBuilding]);

  // Handle Android hardware back button when building to cancel
  useEffect(() => {
    if (Platform.OS === 'android' && isBuilding) {
      const onBackPress = () => {
        setIsBuilding(false);
        setClientName('');
        setSelection({});
        setQtyWarnings({});
        return true; // Prevent default behavior
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }
  }, [isBuilding]);

  const loadData = useCallback(async () => {
    try {
      const [stock, pr, saved] = await Promise.all([
        fetchSecondaryStock(),
        fetchPrices(),
        fetchSavedClients(),
      ]);
      setBrazilStock(stock);
      setPrices(pr);
      setSavedClients(saved);
    } catch (e: any) {
      Alert.alert(t('client.alert.loadFailed'), e.message);
    }
  }, [t]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData().catch(console.warn);
    setRefreshing(false);
  }, [loadData]);

  const priceMap = useMemo(() => {
    const map: Record<number, number> = {};
    prices.forEach((p) => { map[p.article_id] = p.price; });
    return map;
  }, [prices]);

  const currentItems = useMemo<ClientItem[]>(() => {
    return brazilStock
      .map((a) => {
        const qty = parseInt(selection[a.id] || '0', 10);
        if (qty > 0) {
          return { id: a.id, name: a.name, quantity: qty, unitPrice: priceMap[a.id] || 0, available: a.quantity };
        }
        return null;
      })
      .filter((x): x is ClientItem => !!x);
  }, [brazilStock, selection, priceMap]);

  const currentTotal = useMemo(() => currentItems.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0), [currentItems]);
  const totalUnits = useMemo(() => currentItems.reduce((sum, it) => sum + it.quantity, 0), [currentItems]);

  // Check for validation errors in current selection
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    currentItems.forEach(item => {
      if (item.quantity > item.available) {
        errors.push(`${item.name}: ${t('client.alert.qtyExceedsAvailable')}`);
      }
      if (item.unitPrice <= 0) {
        errors.push(`${item.name}: ${t('client.alert.noPriceSet')}`);
      }
    });
    return errors;
  }, [currentItems, t]);

  const hasValidationErrors = validationErrors.length > 0;

  // Filtered lists for search
  const filteredBrazilStock = useMemo(() => {
    if (!searchQuery.trim()) return brazilStock;
    const query = searchQuery.toLowerCase();
    return brazilStock.filter(a => a.name.toLowerCase().includes(query));
  }, [brazilStock, searchQuery]);

  const filteredSavedClients = useMemo(() => {
    if (!searchQuery.trim()) return savedClients;
    const query = searchQuery.toLowerCase();
    return savedClients.filter(c => c.client.toLowerCase().includes(query));
  }, [savedClients, searchQuery]);

  const saveClient = async () => {
    if (!clientName.trim()) return Alert.alert(t('client.alert.enterName'));
    if (currentItems.length === 0) return Alert.alert(t('client.alert.emptySelection'));
    
    // Validate before saving
    if (hasValidationErrors) {
      return Alert.alert(
        t('client.alert.validationErrors'),
        validationErrors.join('\n')
      );
    }

    setIsSaving(true);
    try {
      await Promise.all(currentItems.map((it) => sellSecondary(it.id, it.quantity)));
      await persistClient(clientName.trim(), currentItems.map((it) => ({ article_id: it.id, quantity: it.quantity, price: it.unitPrice, name: it.name })));
      Alert.alert(t('client.alert.clientSaved'));
      setSelection({}); setClientName(''); setQtyWarnings({}); setIsBuilding(false); loadData();
    } catch (e: any) { 
      Alert.alert(t('client.alert.error'), e.message); 
    } finally {
      setIsSaving(false);
    }
  };

  const openDetail = async (summary: SavedSummary) => {
    try {
      const lines = await fetchClientItems(summary.id);
      setDetailModal({ id: summary.id, client: summary.client, total: summary.total, created_at: summary.created_at, items: lines.map((l) => ({ id: l.article_id, name: l.name, quantity: l.quantity, unitPrice: l.price, available: 0 })) });
    } catch (e: any) { Alert.alert(t('client.alert.detailLoadFailed'), e.message); }
  };

  // put near other handlers
  const confirmDeleteSaved = (id: number) => {
    Alert.alert(t('client.alert.confirmDeleteTitle'), t('client.alert.confirmDeleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' }, { text: t('common.delete'), style: 'destructive', onPress: () => handleDelete(id) }
    ]);
  };

  const handleDelete = async (id: number) => { try { await deleteSavedClient(id); loadData(); } catch (e: any) { Alert.alert(t('client.alert.error'), e.message); } };

  const handleQtyChange = (itemId: number, value: string, availableQty: number) => {
    setSelection((sel) => ({ ...sel, [itemId]: value }));
    
    // Validate quantity
    const qty = parseInt(value || '0', 10);
    if (value === '') {
      setQtyWarnings((warnings) => {
        const next = { ...warnings };
        delete next[itemId];
        return next;
      });
    } else if (isNaN(qty) || qty <= 0) {
      setQtyWarnings((warnings) => ({ ...warnings, [itemId]: t('brazil.alert.qtyMustBePositive') }));
    } else if (qty > availableQty) {
      setQtyWarnings((warnings) => ({ ...warnings, [itemId]: t('brazil.alert.qtyExceedsMax', { max: availableQty }) }));
    } else {
      setQtyWarnings((warnings) => {
        const next = { ...warnings };
        delete next[itemId];
        return next;
      });
    }
  };

  const shareReceipt = async (cart: ReceiptPayload) => {
    const itemsRows = cart.items.map((it) => `
      <div class="item-row">
        <div class="item-left">
          <div class="item-name">${it.name}</div>
          <div class="item-qty">${it.quantity} x ${currencySymbol}${it.unitPrice.toFixed(2)}</div>
        </div>
        <div class="item-total">${currencySymbol}${(it.quantity * it.unitPrice).toFixed(2)}</div>
      </div>
      <div class="dotted-line"></div>
    `).join('');

    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          @page {
            size: A4;
            margin: 0;
          }
          
          body {
            font-family: 'Courier New', Courier, monospace;
            background: white;
            margin: 0;
            padding: 0;
            width: 210mm;
            height: 297mm;
            color: #2c3e50;
          }
          
          .receipt {
            background: white;
            padding: 50px 40px;
            width: 100%;
            height: 100%;
            box-sizing: border-box;
          }
          
          .header {
            text-align: center;
            margin-bottom: 24px;
            border-bottom: 2px dashed #2c3e50;
            padding-bottom: 16px;
          }
          
          .icon {
            font-size: 72px;
            margin-bottom: 12px;
          }
          
          .icon::before {
            font-family: "Font Awesome 5 Free";
            font-weight: 900;
            content: "\\f007";
          }
          
          .store-name {
            font-size: 42px;
            font-weight: bold;
            letter-spacing: 6px;
            margin-bottom: 8px;
          }
          
          .receipt-label {
            font-size: 18px;
            letter-spacing: 3px;
            color: #6b7280;
          }
          
          .customer-section {
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 1px dashed #9ca3af;
          }
          
          .customer-label {
            font-size: 16px;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 6px;
          }
          
          .customer-name {
            font-size: 24px;
            font-weight: bold;
            color: #2c3e50;
          }
          
          .items-section {
            margin-bottom: 20px;
          }
          
          .item-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 12px 0;
          }
          
          .item-left {
            flex: 1;
            margin-right: 12px;
          }
          
          .item-name {
            font-size: 20px;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 6px;
          }
          
          .item-qty {
            font-size: 17px;
            color: #6b7280;
          }
          
          .item-total {
            font-size: 20px;
            font-weight: bold;
            color: #2c3e50;
            white-space: nowrap;
          }
          
          .dotted-line {
            border-bottom: 1px dotted #d1d5db;
            margin: 4px 0;
          }
          
          .dashed-line {
            border-bottom: 2px dashed #9ca3af;
            margin: 16px 0;
          }
          
          .double-line {
            border-bottom: 3px double #2c3e50;
            margin: 12px 0;
          }
          
          .totals-section {
            margin-top: 20px;
            padding-top: 12px;
            border-top: 2px dashed #2c3e50;
          }
          
          .subtotal-row {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            font-size: 20px;
          }
          
          .subtotal-label {
            color: #6b7280;
            font-weight: bold;
          }
          
          .subtotal-value {
            font-weight: bold;
            color: #2c3e50;
          }
          
          .grand-total-row {
            display: flex;
            justify-content: space-between;
            padding: 18px 0;
            margin-top: 12px;
            border-top: 4px double #2c3e50;
            border-bottom: 4px double #2c3e50;
          }
          
          .grand-total-label {
            font-size: 28px;
            font-weight: bold;
            letter-spacing: 3px;
          }
          
          .grand-total-value {
            font-size: 32px;
            font-weight: bold;
          }
          
          .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 24px;
            border-top: 2px dashed #d1d5db;
            color: #9ca3af;
            font-size: 16px;
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <div class="icon"></div>
            <div class="store-name">RECEIPT</div>
            <div class="receipt-label">SALES RECEIPT</div>
          </div>
          
          <div class="customer-section">
            <div class="customer-label">Customer</div>
            <div class="customer-name">${cart.client}</div>
          </div>
          
          <div class="items-section">
            ${itemsRows}
          </div>
          
          <div class="totals-section">
            <div class="grand-total-row">
              <span class="grand-total-label">TOTAL</span>
              <span class="grand-total-value">${currencySymbol}${cart.total.toFixed(2)}</span>
            </div>
          </div>
          
          <div class="footer">
            Thank you for your business!
          </div>
        </div>
      </body>
    </html>
  `;

    try {
      // 2. Generate the PDF (temporary file)
      const { uri } = await Print.printToFileAsync({ html });

      // 3. Build a safe filename from the client name
      //    Replace spaces/special chars as needed:
      const safeName = cart.client
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_');
      const newFilename = `${safeName}.pdf`;

      // 4. Define a new URI in the app's document directory
      const newUri = `${(FileSystem as any).documentDirectory}${newFilename}`;

      // 5. If a file with that name already exists, delete it
      const info = await FileSystem.getInfoAsync(newUri);
      if (info.exists) {
        await FileSystem.deleteAsync(newUri, { idempotent: true });
      }

      // 6. Move (rename) the temp PDF to the new URI
      await FileSystem.moveAsync({
        from: uri,
        to: newUri,
      });

      // 7. Share the renamed PDF
      await Sharing.shareAsync(newUri);
    } catch (e: any) {
      Alert.alert(t('client.alert.shareFailed'), e.message);
    }
  };

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {!isBuilding && (
          <TouchableOpacity
            onPress={() => setClientModalVisible(true)}
            style={[styles.addBtn, { backgroundColor: theme.accent }]}
          >
            <FontAwesome name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        )}

        {isBuilding ? (
          <>
            <View style={styles.subHeaderRow}>
              <TouchableOpacity
                onPress={() => {
                  setIsBuilding(false);
                  setClientName('');
                  setSelection({});
                  setQtyWarnings({});
                }}
                style={styles.cancelBtn}
              >
                <MaterialIcons name="close" size={24} color={theme.primary} />
              </TouchableOpacity>
              <FontAwesome name="user-circle" size={20} color={theme.primary} />
              <Text style={[styles.subHeader, { color: theme.primary }]}> 
                {clientName || t('client.newClient')}
              </Text>
            </View>

            {/* Search Bar */}
            <View style={[styles.searchContainer, { backgroundColor: theme.background }]}>
              <View style={[styles.searchWrapper, { borderColor: theme.border, backgroundColor: theme.card }]}>
                <MaterialIcons name="search" size={20} color={theme.icon} style={styles.searchIcon} />
                <TextInput
                  style={[styles.searchInput, { color: theme.text }]}
                  placeholder={t('client.searchPlaceholder')}
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

            {brazilStock.length === 0 ? (
              <View style={styles.emptyContainer}>
                <FontAwesome name="inbox" size={64} color={theme.icon} style={{ opacity: 0.4 }} />
                <Text style={[styles.emptyText, { color: theme.text }]}>
                  {t('client.alert.emptyStock')}
                </Text>
              </View>
            ) : filteredBrazilStock.length === 0 ? (
              <View style={styles.emptyContainer}>
                <FontAwesome name="search" size={64} color={theme.icon} style={{ opacity: 0.4 }} />
                <Text style={[styles.emptyText, { color: theme.text }]}>
                  {t('client.noResults')}
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.itemList}
                contentContainerStyle={{ paddingBottom: 96 }}
              >
                {filteredBrazilStock.map((a) => {
                const raw = selection[a.id];
                const selected = raw !== undefined;
                const warning = qtyWarnings[a.id];
                return (
                  <View key={a.id}>
                    <View
                      style={[
                        styles.card,
                        { backgroundColor: theme.card, shadowColor: theme.shadow },
                      ]}
                    >
                      <Pressable
                        onPress={() =>
                          setSelection((sel) => {
                            const next = { ...sel };
                            if (selected) {
                              delete next[a.id];
                              setQtyWarnings((warnings) => {
                                const nextWarnings = { ...warnings };
                                delete nextWarnings[a.id];
                                return nextWarnings;
                              });
                            } else {
                              next[a.id] = '1';
                            }
                            return next;
                          })
                        }
                      >
                        <MaterialIcons
                          name={
                            selected ? 'check-box' : 'check-box-outline-blank'
                          }
                          size={24}
                          color={theme.accent}
                        />
                      </Pressable>
                      <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>
                        {a.name}
                      </Text>
                      <Text style={[styles.infoText, { color: theme.text }]}> {t('client.available', { count: a.quantity })} </Text>
                      <Text style={[styles.infoText, { color: theme.text }]}>{`${currencySymbol}${(priceMap[a.id] || 0).toFixed(2)}`}</Text>
                      <TextInput
                        value={raw}
                        editable={selected}
                        keyboardType="numeric"
                        onChangeText={(val) => handleQtyChange(a.id, val, a.quantity)}
                        style={[
                          styles.qtyInput,
                          { 
                            borderColor: warning ? '#e74c3c' : theme.border, 
                            backgroundColor: warning ? '#e74c3c15' : theme.background,
                            color: theme.text 
                          },
                        ]}
                        placeholder={t('client.table.qty')}
                        placeholderTextColor={theme.placeholder}
                      />
                    </View>
                    {warning && selected && (
                      <View style={[styles.itemWarning, { backgroundColor: '#fee2e2' }]}>
                        <MaterialIcons name="error-outline" size={14} color="#dc2626" />
                        <Text style={[styles.itemWarningText, { color: '#dc2626' }]}>{warning}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
              </ScrollView>
            )}

            <View
              style={[
                styles.builderFooter,
                { backgroundColor: theme.card, borderColor: theme.border, bottom: 0 },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={styles.totalBadges}>
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: theme.background, borderColor: theme.border },
                  ]}
                  accessible
                  accessibilityLabel={`Total amount ${currencySymbol}${currentTotal.toFixed(2)}`}
                >
                  <FontAwesome name="money" size={16} color={theme.text} />
                  <Text style={[styles.badgeText, { color: theme.text }]} numberOfLines={1}>
                    {`${currencySymbol}${currentTotal.toFixed(2)}`}
                  </Text>
                </View>

                <View
                  style={[
                    styles.badge,
                    { backgroundColor: theme.background, borderColor: theme.border },
                  ]}
                  accessible
                  accessibilityLabel={`Total items ${totalUnits}`}
                >
                  <FontAwesome name="cubes" size={16} color={theme.text} />
                  <Text style={[styles.badgeText, { color: theme.text }]} numberOfLines={1}>
                    {totalUnits}
                  </Text>
                </View>
              </View>
                <Pressable 
                  onPress={saveClient} 
                  disabled={isSaving}
                  style={[
                    styles.actionBtn, 
                    { 
                      backgroundColor: isSaving ? theme.border : theme.accent,
                      opacity: isSaving ? 0.6 : 1
                    }
                  ]}
                > 
                  {isSaving ? (
                    <>
                      <MaterialIcons name="hourglass-empty" size={18} color="#fff" />
                      <Text style={styles.actionBtnText}>{t('client.alert.savingClient')}</Text>
                    </>
                  ) : (
                    <>
                      <FontAwesome name="save" size={18} color="#fff" />
                      <Text style={styles.actionBtnText}>{t('common.save')}</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </>
        ) : (
          <>
            {/* Search Bar */}
            <View style={[styles.searchContainer, { backgroundColor: theme.background }]}>
              <View style={[styles.searchWrapper, { borderColor: theme.border, backgroundColor: theme.card }]}>
                <MaterialIcons name="search" size={20} color={theme.icon} style={styles.searchIcon} />
                <TextInput
                  style={[styles.searchInput, { color: theme.text }]}
                  placeholder={t('client.searchPlaceholder')}
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

            <FlatList
              data={filteredSavedClients}
              keyExtractor={(i) => i.id.toString()}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={[theme.accent]}
                  tintColor={theme.accent}
                />
              }
              ListEmptyComponent={() => (
                <View style={styles.emptyContainer}>
                  <FontAwesome name="inbox" size={48} color={theme.placeholder} />
                  <Text style={[styles.emptyText, { color: theme.placeholder }]}>
                    {searchQuery ? t('client.noResults') : t('client.empty')}
                  </Text>
                </View>
              )}
              renderItem={({ item }) => (
              <Pressable
                style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.shadow }]}
                onPress={() => openDetail(item)}
                onLongPress={() => confirmDeleteSaved(item.id)}
              >
                <FontAwesome name="user" size={24} color={theme.accent} style={styles.icon} />
                <Text style={[styles.cardText, { color: theme.text }]}>{item.client}</Text>
                <Text style={[styles.infoText, { color: theme.text }]}>{`${currencySymbol}${item.total.toFixed(2)}`}</Text>
                <Pressable onPress={() => confirmDeleteSaved(item.id)} hitSlop={10} accessibilityLabel={t('client.a11y.deleteClient', { name: item.client })} style={styles.trashBtn}>
                  <FontAwesome name="trash" size={18} color={theme.accent} />
                </Pressable>
              </Pressable>
            )}
          />
          </>
        )}

        {/* Name Modal */}
        <Modal visible={clientModalVisible} transparent animationType="fade" onRequestClose={() => { setClientModalVisible(false); }}> 
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
              <FontAwesome name="user-circle" size={32} color={theme.accent} style={styles.modalIcon} />
              <Text style={[styles.modalTitle, { color: theme.primary }]}>{t('client.newClientName')}</Text>
              <TextInput value={clientName} onChangeText={setClientName} placeholder={t('client.placeholder.name')} placeholderTextColor={theme.placeholder} style={[styles.modalInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]} />
              <View style={styles.modalActions}>
                <Pressable onPress={() => { if (!clientName.trim()) { return Alert.alert(t('client.alert.enterName')); } setClientModalVisible(false); setIsBuilding(true); }} style={[styles.modalBtn, { backgroundColor: theme.accent }]}>
                  <Text style={{ color: '#fff' }}>{t('common.save')}</Text>
                </Pressable>
                <Pressable onPress={() => setClientModalVisible(false)} style={[styles.modalBtn, { borderWidth: 1, borderColor: theme.accent, backgroundColor: 'transparent' }]}>
                  <Text style={{ color: theme.accent, fontWeight: '600' }}>{t('common.cancel')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Detail Modal */}
        <Modal visible={!!detailModal} transparent animationType="slide" onRequestClose={() => { setDetailModal(null); }}>
          <View style={styles.modalOverlay}>
            <View style={styles.receiptPaper}>
              {/* Receipt Header - Store/Business Info */}
              <View style={styles.receiptHeader}>
                <FontAwesome name="user-circle" size={32} color="#2c3e50" />
                <Text style={styles.receiptStoreName}>RECEIPT</Text>
                <View style={styles.receiptDashedLine} />
              </View>

              {/* Customer Info */}
              <View style={styles.receiptInfoSection}>
                <View style={styles.receiptInfoRow}>
                  <Text style={styles.receiptLabel}>Customer:</Text>
                  <Text style={styles.receiptValue}>{detailModal?.client}</Text>
                </View>
                <View style={styles.receiptDashedLine} />
              </View>

              {/* Items List */}
              <ScrollView style={styles.receiptItemsScroll} showsVerticalScrollIndicator={false}>
                {detailModal?.items.map((it, idx) => (
                  <View key={idx}>
                    <View style={styles.receiptItemRow}>
                      <View style={styles.receiptItemNameQty}>
                        <Text style={styles.receiptItemName} numberOfLines={2}>{it.name}</Text>
                        <Text style={styles.receiptItemQtyPrice}>
                          {String(it.quantity)} x {currencySymbol}{it.unitPrice.toFixed(2)}
                        </Text>
                      </View>
                      <Text style={styles.receiptItemTotal}>
                        {currencySymbol}{(it.quantity * it.unitPrice).toFixed(2)}
                      </Text>
                    </View>
                    {idx < detailModal.items.length - 1 && <View style={styles.receiptDottedLine} />}
                  </View>
                ))}
              </ScrollView>

              {/* Total Section */}
              <View style={styles.receiptDashedLine} />
              <View style={styles.receiptTotalSection}>
                <View style={styles.receiptGrandTotalRow}>
                  <Text style={styles.receiptGrandTotalLabel}>TOTAL:</Text>
                  <Text style={styles.receiptGrandTotalValue}>
                    {detailModal ? `${currencySymbol}${detailModal.total.toFixed(2)}` : ''}
                  </Text>
                </View>
                <View style={styles.receiptDoubleLine} />
              </View>

              {/* Action Buttons */}
              <View style={styles.receiptActions}>
                <Pressable 
                  onPress={() => detailModal && shareReceipt(detailModal)} 
                  style={({ pressed }) => [
                    styles.receiptActionBtn, 
                    { backgroundColor: '#10b981', opacity: pressed ? 0.85 : 1 }
                  ]}
                > 
                  <FontAwesome name="share-square-o" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.receiptActionBtnText}>Share</Text>
                </Pressable>
                {detailModal && (
                  <Pressable 
                    onPress={() => { confirmDeleteSaved(detailModal.id); setDetailModal(null); }} 
                    style={({ pressed }) => [
                      styles.receiptActionBtn,
                      { backgroundColor: '#ef4444', opacity: pressed ? 0.85 : 1 }
                    ]}
                  > 
                    <FontAwesome name="trash-o" size={16} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.receiptActionBtnText}>Delete</Text>
                  </Pressable>
                )}
                <Pressable 
                  onPress={() => setDetailModal(null)} 
                  style={({ pressed }) => [
                    styles.receiptActionBtn,
                    { backgroundColor: '#6b7280', opacity: pressed ? 0.85 : 1 }
                  ]}
                > 
                  <FontAwesome name="times" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.receiptActionBtnText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Styles
const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header (unused in this file but refreshed)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    elevation: 6,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginLeft: 12,
    letterSpacing: 0.3,
  },

  // Floating action button
  addBtn: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8, // Android shadow
    zIndex: 10,
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 36,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    fontStyle: 'italic',
    opacity: 0.7,
  },

  // Cards
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginVertical: 7,
    borderRadius: 14,
    elevation: 3,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { marginRight: 12 },
  cardText: { flex: 1, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },

  // Inline info bits
  infoText: {
    minWidth: 88,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.85,
    marginLeft: 8,
  },
  itemName: {
    flex: 1,
    fontSize: 16,
    marginHorizontal: 8,
    fontWeight: '600',
  },
  qtyInput: {
    width: 64,
    height: 40,
    borderWidth: 1,
    borderRadius: 10,
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginLeft: 10,
    fontSize: 16,
    fontWeight: '700',
  },
  itemWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: -4,
    marginBottom: 8,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  itemWarningText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },

  // Builder
  subHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 4,
  },
  cancelBtn: {
    marginRight: 8,
    padding: 4,
  },
  subHeader: {
    fontSize: 18,
    fontWeight: '800',
    marginLeft: 8,
    letterSpacing: 0.3,
  },
  itemList: { flex: 1, marginTop: 8 },

  // Search
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

  // Footer (pinned)
  builderFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    /* bottom is injected inline */
    flexDirection: 'column',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 12,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  validationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  validationText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  totalText: { fontSize: 18, fontWeight: '800', letterSpacing: 0.2 },

  footerButtons: {
    flexDirection: 'row',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginLeft: 12,
    minWidth: 108,
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '800',
    marginLeft: 8,
    fontSize: 15,
    letterSpacing: 0.3,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '96%',
    maxWidth: 680,
    maxHeight: '85%',
    borderRadius: 12,
    padding: 26,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalIcon: { alignSelf: 'center', marginBottom: 14 },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  modalInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    marginBottom: 20,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginLeft: 12,
  },

  // Detail modal
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  detailHeaderTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginLeft: 10,
    letterSpacing: 0.2,
  },
  detailList: {
    maxHeight: 480,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailRowAlt: {
    backgroundColor: 'rgba(0,0,0,0.03)',
  },

  detailItem: { flex: 1, fontSize: 16, fontWeight: '600' },
  detailQty: { width: 44, textAlign: 'center', fontWeight: '700' },
  detailPrice: { width: 76, textAlign: 'right', fontWeight: '700' },
  detailTotal: { width: 86, textAlign: 'right', marginLeft: 12, fontWeight: '800' },

  // Total badges
  totalBadges: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  badgeText: { marginLeft: 8, fontWeight: '800', fontSize: 16, letterSpacing: 0.2 },
  trashBtn: { marginLeft: 8, padding: 6, borderRadius: 8 },

  // Receipt Paper Styles - Traditional Receipt Look
  receiptPaper: {
    width: '92%',
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 24,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
  },
  receiptHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  receiptStoreName: {
    fontSize: 24,
    fontWeight: '900',
    color: '#2c3e50',
    letterSpacing: 2,
    marginTop: 8,
    marginBottom: 12,
  },
  receiptDashedLine: {
    width: '100%',
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#9ca3af',
    marginVertical: 12,
  },
  receiptDottedLine: {
    width: '100%',
    height: 1,
    borderStyle: 'dotted',
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginVertical: 8,
  },
  receiptDoubleLine: {
    width: '100%',
    height: 3,
    backgroundColor: '#2c3e50',
    marginVertical: 8,
  },
  receiptInfoSection: {
    marginBottom: 12,
  },
  receiptInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  receiptLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  receiptValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2c3e50',
  },
  receiptItemsScroll: {
    maxHeight: 300,
  },
  receiptItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  receiptItemNameQty: {
    flex: 1,
    marginRight: 12,
  },
  receiptItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 2,
  },
  receiptItemQtyPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  receiptItemTotal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2c3e50',
    minWidth: 80,
    textAlign: 'right',
  },
  receiptTotalSection: {
    marginTop: 8,
    marginBottom: 16,
  },
  receiptSubtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  receiptSubtotalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  receiptSubtotalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50',
  },
  receiptGrandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  receiptGrandTotalLabel: {
    fontSize: 18,
    fontWeight: '900',
    color: '#2c3e50',
    letterSpacing: 1,
  },
  receiptGrandTotalValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#2c3e50',
    letterSpacing: 0.5,
  },
  receiptFooterMsg: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  receiptThankYou: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2c3e50',
    marginBottom: 4,
  },
  receiptFooterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
  },
  
  // Receipt action buttons
  receiptActions: {
    flexDirection: 'row',
    gap: 8,
  },
  receiptActionBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
});

