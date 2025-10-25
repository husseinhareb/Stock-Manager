// src/screens/(tabs)/brazil.tsx
import { FontAwesome } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	Alert,
	Animated,
	Easing,
	FlatList,
	Keyboard,
	KeyboardAvoidingView,
	Modal,
	PanResponder,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { Article, Price } from '@/src/db';
import {
	fetchMainStock,
	fetchPrices,
	fetchSecondaryStock,
	getSetting,
	moveToSecondary,
	returnToMain,
	setPrice,
} from '@/src/db';

export default function BrazilStockScreen() {
	const scheme = useColorScheme();
	const theme = Colors[scheme ?? 'light'];
	const { t } = useTranslation();

	// Currency
	const [currencyCode, setCurrencyCode] = useState('USD');
	const [currencySymbol, setCurrencySymbol] = useState('$');
	const SYMBOLS: Record<string, string> = {
		USD: '$', EUR: '€', GBP: '£',
		JPY: '¥', CAD: 'C$', AUD: 'A$',
		CHF: 'CHF', CNY: '¥', BRL: 'R$'
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

	// Data
	const [mainStock, setMainStock] = useState<Article[]>([]);
	const [brazilStock, setBrazilStock] = useState<Article[]>([]);
	const [prices, setPrices] = useState<Price[]>([]);

	// Inline quantities
	const [moveQty, setMoveQty] = useState<Record<number, string>>({});
	const [returnQty, setReturnQty] = useState<Record<number, string>>({});

	// Modal
	const [priceModalVisible, setPriceModalVisible] = useState(false);
	const [priceModalArticle, setPriceModalArticle] = useState<Article | null>(null);
	const [priceInput, setPriceInput] = useState('');

	// Focus control — keep focus on the exact field user touched
	const [focusedKey, setFocusedKey] = useState<string | null>(null);

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
		prices.forEach(p => { m[p.article_id] = p.price; });
		return m;
	}, [prices]);

	const mainTotalQty = useMemo(() => mainStock.reduce((s, a) => s + a.quantity, 0), [mainStock]);
	const brazilTotalQty = useMemo(() => brazilStock.reduce((s, a) => s + a.quantity, 0), [brazilStock]);
	const brazilTotalVal = useMemo(() =>
		brazilStock.reduce((s, a) => s + a.quantity * (priceMap[a.id] || 0), 0),
		[brazilStock, priceMap]
	);

	// Helpers
	const sanitizeInt = (txt: string) => txt.replace(/[^0-9]/g, '');

	const onMove = async (item: Article) => {
		const q = parseInt(moveQty[item.id] || '0', 10);
		if (q <= 0) return Alert.alert(t('brazil.alert.invalidMove'));
		try {
			await moveToSecondary(item.id, q);
			setMoveQty(prev => ({ ...prev, [item.id]: '' }));
			setPriceModalArticle(item);
			setPriceInput('');
			setPriceModalVisible(true);
			Keyboard.dismiss();
			setFocusedKey(null);
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
			Keyboard.dismiss();
			setFocusedKey(null);
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

	const renderMoveItem = ({ item }: { item: Article }) => {
		const key = `move-${item.id}`;
		return (
			<Pressable
				ref={(el) => { if (el) rowRefs.current[item.id] = el; }}
				onLongPress={(e) => startDrag(item, 'main', e.nativeEvent)}
				delayLongPress={220}
				style={({ pressed }) => [
					styles.card,
					{ backgroundColor: theme.card, shadowColor: theme.shadow, opacity: draggingItem?.id === item.id ? 0 : 1 },
					pressed && { transform: [{ scale: 0.98 }] }
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
					keyboardType="number-pad"
					value={moveQty[item.id] ?? ''}
					onChangeText={txt => setMoveQty(m => ({ ...m, [item.id]: sanitizeInt(txt) }))}
					autoCapitalize="none"
					autoCorrect={false}
					textContentType="none"
					importantForAutofill="no"
					returnKeyType="done"
					blurOnSubmit
					onSubmitEditing={Keyboard.dismiss}
					onFocus={() => setFocusedKey(key)}
					onBlur={() => setFocusedKey(k => (k === key ? null : k))}
					autoFocus={focusedKey === key}
					{...(Platform.OS === 'android' ? { disableFullscreenUI: true } : {})}
				/>
				<Pressable onPress={() => onMove(item)} style={[styles.solidBtn, { backgroundColor: theme.primary }]}>
					<FontAwesome name="arrow-right" size={16} color="#fff" />
				</Pressable>
			</Pressable>
		);
	};

	const renderViewItem = ({ item }: { item: Article }) => {
		const unit = priceMap[item.id] || 0;
		const total = (unit * item.quantity).toFixed(2);
		const key = `ret-${item.id}`;
		return (
			<Pressable
				ref={(el) => { if (el) rowRefs.current[item.id] = el; }}
				onLongPress={(e) => startDrag(item, 'brazil', e.nativeEvent)}
				delayLongPress={220}
				style={({ pressed }) => [
					styles.card,
					{ backgroundColor: theme.card, shadowColor: theme.shadow, opacity: draggingItem?.id === item.id ? 0 : 1 },
					pressed && { transform: [{ scale: 0.98 }] }
				]}> 
				<FontAwesome name="archive" size={20} color={theme.accent} style={styles.icon} />
				<Text style={[styles.cardText, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
				<View style={[styles.badge, { backgroundColor: theme.accent }]}>
					<Text style={styles.badgeText}>{item.quantity}</Text>
				</View>
				<Text style={{ width: 60, textAlign: 'center', color: theme.text, fontSize: 16 }}>
					{`${currencySymbol}${unit.toFixed(2)}`}
				</Text>
				<Text
					style={[styles.cellAmount, { color: theme.text }]}
					numberOfLines={1}
					allowFontScaling={false}
				>
					{`${currencySymbol}${unit.toFixed(2)}`}
				</Text>
				<Text
					style={[styles.cellAmount, { color: theme.text }]}
					numberOfLines={1}
					allowFontScaling={false}
				>
					{`${currencySymbol}${total}`}
				</Text>
				<TextInput
					style={[styles.smallInput, { borderColor: theme.border, color: theme.text }]}
					placeholder={t('brazil.placeholder.ret')}
					placeholderTextColor={theme.placeholder}
					keyboardType="number-pad"
					value={returnQty[item.id] ?? ''}
					onChangeText={txt => setReturnQty(m => ({ ...m, [item.id]: sanitizeInt(txt) }))}
					autoCapitalize="none"
					autoCorrect={false}
					textContentType="none"
					importantForAutofill="no"
					returnKeyType="done"
					blurOnSubmit
					onSubmitEditing={Keyboard.dismiss}
					onFocus={() => setFocusedKey(key)}
					onBlur={() => setFocusedKey(k => (k === key ? null : k))}
					autoFocus={focusedKey === key}
					{...(Platform.OS === 'android' ? { disableFullscreenUI: true } : {})}
				/>
				<Pressable onPress={() => onReturn(item)} style={[styles.solidBtn, { backgroundColor: '#FF5F6D' }]}>
					<FontAwesome name="arrow-left" size={16} color="#fff" />
				</Pressable>
			</Pressable>
		);
	};

	// --- Drag & drop state and handlers ---
	const [draggingItem, setDraggingItem] = useState<Article | null>(null);
	const [dragOrigin, setDragOrigin] = useState<'main' | 'brazil' | null>(null);
	const dragPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
	// small scale + opacity to make the preview feel "stuck" to the finger
	const dragScale = useRef(new Animated.Value(1)).current;
	const dragOpacity = useRef(new Animated.Value(1)).current;
	const panResponder = useRef<any>(null);
	const mainLayout = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
	const brazilLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
	const mainRef = useRef<any>(null);
	const brazilRef = useRef<any>(null);
	const transferOriginRef = useRef<'main' | 'brazil' | null>(null);
	const [highlightTarget, setHighlightTarget] = useState<'main' | 'brazil' | null>(null);

	// Transfer modal state
	const [transferModalVisible, setTransferModalVisible] = useState(false);
	const [transferQty, setTransferQty] = useState('');
	const [transferPrice, setTransferPrice] = useState('');
	const transferSourceRef = useRef<Article | null>(null);

	// Root container offset (to align window coords with overlay coords)
	const rootRef = useRef<any>(null);
	const rootOffsetRef = useRef({ x: 0, y: 0 });

	// Per-row refs so we can measure the actual grabbed row
	const rowRefs = useRef<Record<number, any>>({});

	// Live preview size (match grabbed row)
	const [previewSize, setPreviewSize] = useState({ width: 260, height: 56 });
	const previewSizeRef = useRef(previewSize);
	useEffect(() => { previewSizeRef.current = previewSize; }, [previewSize]);

	// Preview sizing for centering under finger is tracked in `previewSize` (measured per-row)

	// helper to animate release / snap
	const animateRelease = (droppedOn: 'main' | 'brazil' | null) => {
		if (droppedOn) {
			const origin = transferOriginRef.current;
			let tgt = null;
			if (origin === 'main') tgt = brazilLayoutRef.current;
			else if (origin === 'brazil') tgt = mainLayout.current;
			if (tgt) {
				// convert target (window) -> overlay coords and center preview in the target area
				const { x: cx, y: cy } = rootOffsetRef.current;
				const targetX = (tgt.x - cx) + tgt.width / 2 - previewSize.width / 2;
				const targetY = (tgt.y - cy) + tgt.height / 2 - previewSize.height / 2;
				Animated.parallel([
					Animated.timing(dragPos, { toValue: { x: targetX, y: targetY }, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
					Animated.timing(dragScale, { toValue: 0.95, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
				]).start(() => {
					// open modal after the snap animation
					setDraggingItem(null);
					setHighlightTarget(null);
					setTransferQty('');
					setTransferPrice('');
					setTransferModalVisible(true);
					// reset values
					dragScale.setValue(1);
					dragOpacity.setValue(1);
					dragPos.setValue({ x: 0, y: 0 });
				});
				return;
			}
		}
		// cancelled or no valid target — fade out the preview quickly then clear
		Animated.parallel([
			Animated.timing(dragOpacity, { toValue: 0, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: false }),
			Animated.timing(dragScale, { toValue: 0.9, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: false }),
		]).start(() => {
			setDraggingItem(null);
			setHighlightTarget(null);
			transferSourceRef.current = null;
			transferOriginRef.current = null;
			dragScale.setValue(1);
			dragOpacity.setValue(1);
			dragPos.setValue({ x: 0, y: 0 });
		});
	};

	// create a single PanResponder once; it reads the live previewSize from previewSizeRef
	useEffect(() => {
		if (panResponder.current) return;
		panResponder.current = PanResponder.create({
			onStartShouldSetPanResponder: () => false,
			onStartShouldSetPanResponderCapture: () => false,

			// Grab the gesture as soon as finger moves after long-press
			onMoveShouldSetPanResponder: () => !!transferSourceRef.current,
			onMoveShouldSetPanResponderCapture: () => !!transferSourceRef.current,
			onPanResponderMove: (_, gs) => {
				if (!transferSourceRef.current) return;
				// convert window coords -> overlay coords using root offset and keep preview centered under finger
				const { x: cx, y: cy } = rootOffsetRef.current;
				const w = previewSizeRef.current.width, h = previewSizeRef.current.height;
				dragPos.setValue({ x: gs.moveX - cx - w / 2, y: gs.moveY - cy - h / 2 });
				const x = gs.moveX, y = gs.moveY;
				const origin = transferOriginRef.current;
				if (origin === 'main') {
					const tgt = brazilLayoutRef.current;
					if (tgt && x >= tgt.x && x <= tgt.x + tgt.width && y >= tgt.y && y <= tgt.y + tgt.height) setHighlightTarget('brazil');
					else setHighlightTarget(null);
				} else if (origin === 'brazil') {
					const tgt = mainLayout.current;
					if (tgt && x >= tgt.x && x <= tgt.x + tgt.width && y >= tgt.y && y <= tgt.y + tgt.height) setHighlightTarget('main');
					else setHighlightTarget(null);
				}
			},
			onPanResponderRelease: (_, gs) => {
				if (!transferSourceRef.current) return;
				const x = gs.moveX, y = gs.moveY;
				let droppedOn: 'main' | 'brazil' | null = null;
				const origin = transferOriginRef.current;
				if (origin === 'main') {
					const tgt = brazilLayoutRef.current;
					if (tgt && x >= tgt.x && x <= tgt.x + tgt.width && y >= tgt.y && y <= tgt.y + tgt.height) droppedOn = 'brazil';
				} else if (origin === 'brazil') {
					const tgt = mainLayout.current;
					if (tgt && x >= tgt.x && x <= tgt.x + tgt.width && y >= tgt.y && y <= tgt.y + tgt.height) droppedOn = 'main';
				}
				animateRelease(droppedOn);
			},
			onPanResponderTerminationRequest: () => false,
			onPanResponderTerminate: () => animateRelease(null),
		});
	}, []);

	const startDrag = (item: Article, origin: 'main' | 'brazil', nativeEvent: any) => {
		setDraggingItem(item);
	 	setDragOrigin(origin);
	 	transferOriginRef.current = origin;
	 	transferSourceRef.current = item;

		// Try to measure the actual row so the preview matches its size and position
		try {
			rowRefs.current[item.id]?.measureInWindow?.((rx: number, ry: number, rw: number, rh: number) => {
				setPreviewSize({ width: rw, height: rh });
				// Convert window coords to overlay coords
				const { x: cx, y: cy } = rootOffsetRef.current;
				// Center preview under the original long-press point
				dragPos.setValue({ x: nativeEvent.pageX - cx - rw / 2, y: nativeEvent.pageY - cy - rh / 2 });

				// subtle pick-up animation
				dragScale.setValue(1);
				dragOpacity.setValue(1);
				Animated.parallel([
					Animated.timing(dragScale, { toValue: 1.04, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: false }),
					Animated.timing(dragOpacity, { toValue: 1, duration: 100, useNativeDriver: false }),
				]).start();

				// measure section bounds for hit-testing
				try {
					mainRef.current?.measureInWindow?.((x: number, y: number, w: number, h: number) => { mainLayout.current = { x, y, width: w, height: h }; });
					brazilRef.current?.measureInWindow?.((x: number, y: number, w: number, h: number) => { brazilLayoutRef.current = { x, y, width: w, height: h }; });
				} catch {}
			});
		} catch {
			// fallback: center under finger using current previewSize
			const { x: cx, y: cy } = rootOffsetRef.current;
			dragPos.setValue({ x: nativeEvent.pageX - cx - previewSize.width / 2, y: nativeEvent.pageY - cy - previewSize.height / 2 });
			// minimal pick-up animation
			dragScale.setValue(1.04);
			dragOpacity.setValue(1);
		}
	};

	const onMainLayout = (ev: any) => {
		// store rough layout (fallback) and try to get absolute coords via measureInWindow
		const { x, y, width, height } = ev.nativeEvent.layout;
		mainLayout.current = { x, y, width, height };
		try {
			if (mainRef.current && mainRef.current.measureInWindow) {
				mainRef.current.measureInWindow((mx: number, my: number, mw: number, mh: number) => {
					mainLayout.current = { x: mx, y: my, width: mw, height: mh };
				});
			}
		} catch (e) {
			// ignore
		}
	};
	const onBrazilLayout = (ev: any) => {
		const { x, y, width, height } = ev.nativeEvent.layout;
		brazilLayoutRef.current = { x, y, width, height };
		try {
			if (brazilRef.current && brazilRef.current.measureInWindow) {
				brazilRef.current.measureInWindow((bx: number, by: number, bw: number, bh: number) => {
					brazilLayoutRef.current = { x: bx, y: by, width: bw, height: bh };
				});
			}
		} catch (e) {
			// ignore
		}
	};

	const validateAndPerformTransfer = async () => {
		const src = transferSourceRef.current;
		if (!src) {
			Alert.alert(t('brazil.alert.transferFailed'), t('brazil.alert.unknownItem'));
			setTransferModalVisible(false);
			return;
		}
		const qty = parseInt(transferQty || '0', 10);
		const price = parseFloat(transferPrice || '0');
		if (!qty || qty <= 0 || qty > src.quantity) return Alert.alert(t('brazil.alert.invalidQty'));
		if (isNaN(price) || price < 0) return Alert.alert(t('brazil.alert.invalidPrice'));
		try {
			if (dragOrigin === 'main') {
				await moveToSecondary(src.id, qty);
				await setPrice(src.id, price);
			} else if (dragOrigin === 'brazil') {
				await returnToMain(src.id, qty);
				await setPrice(src.id, price);
			}
			setTransferModalVisible(false);
			transferSourceRef.current = null;
			transferOriginRef.current = null;
			setDragOrigin(null);
			await loadData();
		} catch (e: any) {
			Alert.alert(t('brazil.alert.transferFailed'), e.message);
		}
	};

	return (
		<SafeAreaView
			ref={rootRef}
			{...(panResponder.current ? panResponder.current.panHandlers : {})}
			onLayout={() => {
				try {
					rootRef.current?.measureInWindow?.((x: number, y: number) => {
						rootOffsetRef.current = { x, y };
					});
				} catch {}
			}}
			style={[styles.container, { backgroundColor: theme.background }]}
		> 
			<KeyboardAvoidingView style={styles.container} behavior={Platform.select({ ios: 'padding' })}>
				<View ref={mainRef} onLayout={onMainLayout} style={[
					styles.sectionContainer,
					{ backgroundColor: theme.card, marginBottom: 0 },
					highlightTarget === 'main' ? { borderColor: theme.primary, borderWidth: 2 } : {}
				]}> 
					<Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('brazil.chinaStock')}</Text>
					<FlatList
						data={mainStock.filter(a => a.quantity > 0)}
						keyExtractor={i => i.id.toString()}
						renderItem={renderMoveItem}
						style={styles.listScroll}
						showsVerticalScrollIndicator={false}
						keyboardShouldPersistTaps="handled"
								keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
								scrollEnabled={!draggingItem}
						removeClippedSubviews={false}
						windowSize={7}
						initialNumToRender={12}
						maxToRenderPerBatch={12}
						updateCellsBatchingPeriod={50}
						extraData={{ moveQty, focusedKey }}
					/>
					<View style={[styles.footerBar, { borderTopColor: theme.border }]}>
						<FontAwesome name="cubes" size={18} color={theme.accent} />
						<Text style={[styles.footerText, { color: theme.text }]}>{t('brazil.footer.items', { count: mainTotalQty })}</Text>
					</View>
				</View>

				<View ref={brazilRef} onLayout={onBrazilLayout} style={[
					styles.sectionContainer,
					{ backgroundColor: theme.card },
					highlightTarget === 'brazil' ? { borderColor: theme.primary, borderWidth: 2 } : {}
				]}> 
					<Text style={[styles.heading, { color: theme.primary }]}>{t('brazil.brazilStock')}</Text>
					<FlatList
						data={brazilStock.filter(a => a.quantity > 0)}
						keyExtractor={i => i.id.toString()}
						renderItem={renderViewItem}
						style={styles.listScroll}
						showsVerticalScrollIndicator={false}
						keyboardShouldPersistTaps="handled"
						keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
						scrollEnabled={!draggingItem}
						removeClippedSubviews={false}
						windowSize={7}
						initialNumToRender={12}
						maxToRenderPerBatch={12}
						updateCellsBatchingPeriod={50}
						extraData={{ returnQty, focusedKey, priceMap }}
					/>
					<View style={[styles.footerBar, { borderTopColor: theme.border }]}>
						<FontAwesome name="cubes" size={18} color={theme.accent} />
						<Text style={[styles.footerText, { color: theme.text }]}>{t('brazil.footer.pcs', { count: brazilTotalQty })}</Text>
						<FontAwesome name="dollar" size={18} color={theme.accent} style={{ marginLeft: 20 }} />
						<Text style={[styles.footerText, { color: theme.text }]}>{`${brazilTotalVal.toFixed(2)}`}</Text>
					</View>
				</View>

				{/* Drag preview overlay (captures pan events while dragging) */}
				{draggingItem ? (
					<View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 9999 }} pointerEvents="box-none">
						{draggingItem ? (
							<Animated.View pointerEvents="none" style={{ position: 'absolute', left: (dragPos as any).x, top: (dragPos as any).y, transform: [{ scale: dragScale }], opacity: dragOpacity, zIndex: 10000 }}>
								<View style={[styles.card, { width: previewSize.width, height: previewSize.height, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.card, shadowColor: theme.shadow, overflow: 'hidden' }] }>
									<FontAwesome name="archive" size={20} color={theme.accent} style={styles.icon} />
									<Text style={[styles.cardText, { color: theme.text, maxWidth: 160 }]} numberOfLines={1}>{draggingItem.name}</Text>
									<View style={[styles.badge, { backgroundColor: theme.accent, marginLeft: 8 }] }>
										<Text style={styles.badgeText}>{draggingItem.quantity}</Text>
									</View>
								</View>
							</Animated.View>
						) : null}
					</View>
				) : null}

				{/* Transfer modal: ask for quantity then price */}
				<Modal visible={transferModalVisible} transparent animationType="slide" onRequestClose={() => { setTransferModalVisible(false); }}>
					<View style={styles.modalOverlay}>
						<View style={[styles.modalContent, { backgroundColor: theme.card, shadowColor: theme.shadow }]}> 
							<Text style={[styles.modalTitle, { color: theme.text }]}>{t('brazil.transfer.title')}</Text>
							<TextInput
								style={[styles.modalInput, { borderColor: theme.border }]}
								placeholder={t('brazil.placeholder.qty')}
								placeholderTextColor={theme.placeholder}
								keyboardType="number-pad"
								value={transferQty}
								onChangeText={setTransferQty}
							/>
							<TextInput
								style={[styles.modalInput, { borderColor: theme.border }]}
								placeholder={t('brazil.placeholder.unitPrice')}
								placeholderTextColor={theme.placeholder}
								keyboardType={Platform.select({ ios: 'decimal-pad', android: 'number-pad' })}
								value={transferPrice}
								onChangeText={setTransferPrice}
							/>
							<View style={styles.modalActions}>
								<Pressable onPress={() => { setTransferModalVisible(false); transferSourceRef.current = null; transferOriginRef.current = null; setDragOrigin(null); setHighlightTarget(null); }} style={styles.modalBtn}>
									<Text style={{ color: theme.text, fontWeight: '600' }}>{t('common.cancel')}</Text>
								</Pressable>
								<Pressable onPress={validateAndPerformTransfer} style={[styles.modalBtn, { backgroundColor: theme.primary }]}>
									<Text style={{ color: '#fff', fontWeight: '600' }}>{t('common.save')}</Text>
								</Pressable>
							</View>
						</View>
					</View>
				</Modal>

				<Modal visible={priceModalVisible} transparent animationType="slide" onRequestClose={() => { setPriceModalVisible(false); }}>
					<View style={styles.modalOverlay}>
						<View style={[styles.modalContent, { backgroundColor: theme.card, shadowColor: theme.shadow }]}> 
							<Text style={[styles.modalTitle, { color: theme.text }]}> {t('brazil.setPrice', { name: priceModalArticle?.name })} </Text>
							<TextInput
								style={[styles.modalInput, { borderColor: theme.border }]}
								placeholder={t('brazil.placeholder.unitPrice')}
								placeholderTextColor={theme.placeholder}
								keyboardType={Platform.select({ ios: 'decimal-pad', android: 'number-pad' })}
								value={priceInput}
								onChangeText={setPriceInput}
								onSubmitEditing={onSavePrice}
								autoCapitalize="none"
								autoCorrect={false}
								textContentType="none"
								importantForAutofill="no"
								returnKeyType="done"
								blurOnSubmit
							/>
							<View style={styles.modalActions}>
								<Pressable onPress={() => setPriceModalVisible(false)} style={styles.modalBtn}>
									<Text style={{ color: theme.text, fontWeight: '600' }}>{t('common.cancel')}</Text>
								</Pressable>
								<Pressable onPress={onSavePrice} style={[styles.modalBtn, { backgroundColor: theme.primary }]} >
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

// ---- Styles remain unchanged below ----
const styles = StyleSheet.create({
	container: { flex: 1 },

	// Titles
	heading: { fontSize: 26, fontWeight: '800', margin: 16, letterSpacing: 0.2 },
	header: { fontSize: 26, fontWeight: '800', marginBottom: 12 },
	headerText: { fontSize: 28, fontWeight: '800' },

	// Sections
	sectionContainer: {
		flex: 1,
		marginTop: 12,
		marginHorizontal: 12,
		borderRadius: 16,
		overflow: 'hidden',
		elevation: 6,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 10 },
		shadowOpacity: 0.1,
		shadowRadius: 20,
		borderWidth: StyleSheet.hairlineWidth,
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: '800',
		paddingVertical: 12,
		paddingHorizontal: 16,
		letterSpacing: 0.4,
	},

	// Lists
	listScroll: { flex: 1, paddingHorizontal: 12 },

	// Cards / rows
	card: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 12,
		paddingHorizontal: 14,
		marginVertical: 6,
		marginHorizontal: 4,
		borderRadius: 14,
		backgroundColor: '#FFF',
		elevation: 4,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.12,
		shadowRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
	},
	icon: { marginRight: 10 },
	cardText: { flex: 1, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },

	// Quantity badge
	badge: {
		paddingVertical: 6,
		paddingHorizontal: 10,
		borderRadius: 999,
		minWidth: 34,
		alignItems: 'center',
		justifyContent: 'center',
		marginRight: 8,
	},
	badgeText: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.2 },

	// Cells / inputs / actions
	cell: { width: 72, textAlign: 'center', fontSize: 16 },
	smallInput: {
		width: 64,
		height: 40,
		borderWidth: 1,
		borderRadius: 10,
		paddingVertical: 6,
		paddingHorizontal: 8,
		marginHorizontal: 8,
		textAlign: 'center',
		fontSize: 16,
		fontWeight: '700',
	},
	solidBtn: {
		height: 40,
		minWidth: 40,
		paddingHorizontal: 10,
		borderRadius: 10,
		justifyContent: 'center',
		alignItems: 'center',
		marginLeft: 4,
		elevation: 2,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.12,
		shadowRadius: 6,
	},

	// Footers
	footerBar: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 12,
		paddingHorizontal: 14,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	footerText: { fontSize: 15, fontWeight: '800', marginLeft: 8, letterSpacing: 0.2 },

	// Modal
	modalOverlay: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: 'rgba(0,0,0,0.45)',
		padding: 16,
	},
	modalContent: {
		width: '100%',
		borderRadius: 18,
		padding: 20,
		elevation: 10,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 14 },
		shadowOpacity: 0.18,
		shadowRadius: 24,
		borderWidth: StyleSheet.hairlineWidth,
	},
	modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16, letterSpacing: 0.2 },
	modalInput: {
		borderWidth: 1,
		borderRadius: 12,
		paddingVertical: 12,
		paddingHorizontal: 12,
		fontSize: 16,
		marginBottom: 20,
		// leave background transparent so your theme card shows through
	},

	// Amount cells (unit price / total) — keep on one line and avoid wrapping
	cellAmount: {
		minWidth: 72,
		textAlign: 'center',
		fontSize: 16,
		flexShrink: 0,
	},
	modalActions: { flexDirection: 'row', justifyContent: 'flex-end' },
	modalBtn: {
		paddingVertical: 10,
		paddingHorizontal: 18,
		borderRadius: 12,
		marginLeft: 12,
	},
});
