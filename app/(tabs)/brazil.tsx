// src/screens/(tabs)/brazil.tsx
import { FontAwesome } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	Alert,
	Animated,
	Easing,
	FlatList,
	KeyboardAvoidingView,
	Modal,
	PanResponder,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
import { Colors } from '@constants/Colors';
import { useColorScheme } from '@hooks/useColorScheme';

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

	// Keep refs to latest data for drag operations
	const brazilStockRef = useRef(brazilStock);
	const priceMapRef = useRef(priceMap);
	useEffect(() => { brazilStockRef.current = brazilStock; }, [brazilStock]);
	useEffect(() => { priceMapRef.current = priceMap; }, [priceMap]);

	const mainTotalQty = useMemo(() => mainStock.reduce((s, a) => s + a.quantity, 0), [mainStock]);
	const brazilTotalQty = useMemo(() => brazilStock.reduce((s, a) => s + a.quantity, 0), [brazilStock]);
	const brazilTotalVal = useMemo(() =>
		brazilStock.reduce((s, a) => s + a.quantity * (priceMap[a.id] || 0), 0),
		[brazilStock, priceMap]
	);

	// Helpers
	const sanitizeInt = (txt: string) => txt.replace(/[^0-9]/g, '');

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
		const isDragging = draggingItem?.id === item.id && dragOrigin === 'main';
		return (
			<Pressable
				collapsable={false}
				ref={(el) => { if (el) rowRefs.current[`main-${item.id}`] = el; }}
				onLongPress={(e) => {
					// Don't start drag if any modal is open
					if (!transferModalVisible && !priceModalVisible) {
						startDrag(item, 'main', e.nativeEvent);
					}
				}}
				delayLongPress={150}
				style={({ pressed }) => [
					styles.card,
					{
						backgroundColor: theme.card,
						shadowColor: theme.shadow,
						opacity: isDragging ? 0 : 1,
						transform: pressed ? [{ scale: 0.98 }] : [{ scale: 1 }],
					},
				]}>
				<FontAwesome name="archive" size={20} color={theme.accent} style={styles.icon} />
				<Text style={[styles.cardText, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
				<View style={[styles.badge, { backgroundColor: theme.accent }]}>
					<Text style={styles.badgeText}>{item.quantity}</Text>
				</View>
			</Pressable>
		);
	};

	const renderViewItem = ({ item }: { item: Article }) => {
		const isDragging = draggingItem?.id === item.id && dragOrigin === 'brazil';
		const unit = priceMap[item.id] || 0;
		const total = (unit * item.quantity).toFixed(2);
		return (
			<Pressable
				collapsable={false}
				ref={(el) => { if (el) rowRefs.current[`brazil-${item.id}`] = el; }}
				onLongPress={(e) => {
					// Don't start drag if any modal is open
					if (!transferModalVisible && !priceModalVisible) {
						startDrag(item, 'brazil', e.nativeEvent);
					}
				}}
				delayLongPress={150}
				style={({ pressed }) => [
					styles.card,
					{
						backgroundColor: theme.card,
						shadowColor: theme.shadow,
						opacity: isDragging ? 0 : 1,
						transform: pressed ? [{ scale: 0.98 }] : [{ scale: 1 }],
					},
				]}>
				<FontAwesome name="archive" size={20} color={theme.accent} style={styles.icon} />
				<Text style={[styles.cardText, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
				<View style={[styles.badge, { backgroundColor: theme.accent }]}>
					<Text style={styles.badgeText}>{item.quantity}</Text>
				</View>
				<View style={styles.priceColumn}>
					<Text style={[styles.priceLabel, { color: theme.placeholder }]}>{t('brazil.unitPrice')}</Text>
					<Text
						style={[styles.priceValue, { color: theme.text }]}
						numberOfLines={1}
						allowFontScaling={false}
					>
						{`${currencySymbol}${unit.toFixed(2)}`}
					</Text>
				</View>
				<View style={styles.priceColumn}>
					<Text style={[styles.priceLabel, { color: theme.placeholder }]}>{t('brazil.totalValue')}</Text>
					<Text
						style={[styles.priceValue, { color: theme.text }]}
						numberOfLines={1}
						allowFontScaling={false}
					>
						{`${currencySymbol}${total}`}
					</Text>
				</View>
			</Pressable>
		);
	};

	// --- Enhanced Drag & drop state and handlers ---
	const [draggingItem, setDraggingItem] = useState<Article | null>(null);
	const [dragOrigin, setDragOrigin] = useState<'main' | 'brazil' | null>(null);
	const dragPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
	// Enhanced animations for better visual feedback
	const dragScale = useRef(new Animated.Value(1)).current;
	const dragOpacity = useRef(new Animated.Value(1)).current;
	const dragRotation = useRef(new Animated.Value(0)).current; // Subtle rotation on drag
	const panResponder = useRef<any>(null);
	const mainLayout = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
	const brazilLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
	const mainRef = useRef<any>(null);
	const brazilRef = useRef<any>(null);
	const transferOriginRef = useRef<'main' | 'brazil' | null>(null);
	const [highlightTarget, setHighlightTarget] = useState<'main' | 'brazil' | null>(null);
	const [highlightIntensity, setHighlightIntensity] = useState(0); // For pulsing effect
	// store the exact local press point inside the row so preview anchors to it
	const pressOffsetRef = useRef({ dx: 0, dy: 0 });
	const lastHapticTime = useRef(0); // Prevent haptic spam

	// Transfer modal state
	const [transferModalVisible, setTransferModalVisible] = useState(false);
	const [transferQty, setTransferQty] = useState('');
	const [transferPrice, setTransferPrice] = useState('');
	const [qtyWarning, setQtyWarning] = useState('');
	const [needsPriceInput, setNeedsPriceInput] = useState(false);
	const transferSourceRef = useRef<Article | null>(null);

	// Ensure highlights are cleared when modal opens/closes
	useEffect(() => {
		if (transferModalVisible) {
			// Modal is opening - immediately clear all drag states
			setHighlightTarget(null);
			setDraggingItem(null);
		}
	}, [transferModalVisible]);

	// Root container offset (to align window coords with overlay coords)
	const rootRef = useRef<any>(null);
	const rootOffsetRef = useRef({ x: 0, y: 0 });

	// Per-row refs so we can measure the actual grabbed row (using origin-specific keys)
	const rowRefs = useRef<Record<string, any>>({});

	// Live preview size (match grabbed row)
	const [previewSize, setPreviewSize] = useState({ width: 260, height: 56 });
	const previewSizeRef = useRef(previewSize);
	useEffect(() => { previewSizeRef.current = previewSize; }, [previewSize]);

	// Preview sizing for centering under finger is tracked in `previewSize` (measured per-row)

	// Enhanced animate release / snap with better feedback
	const animateRelease = (droppedOn: 'main' | 'brazil' | null) => {
		if (droppedOn) {
			// Success haptic feedback
			Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

			// Quick fade out animation - no snap needed, just dissolve
			Animated.parallel([
				Animated.timing(dragOpacity, {
					toValue: 0,
					duration: 120,
					easing: Easing.out(Easing.ease),
					useNativeDriver: false
				}),
				Animated.timing(dragScale, {
					toValue: 0.9,
					duration: 120,
					easing: Easing.out(Easing.ease),
					useNativeDriver: false
				}),
			]).start(() => {
				// Clean up and open modal immediately after fade
				setDraggingItem(null);
				setHighlightTarget(null);
				setTransferQty('');
				setTransferPrice('');
				// reset values
				dragScale.setValue(1);
				dragOpacity.setValue(1);
				dragRotation.setValue(0);
				dragPos.setValue({ x: 0, y: 0 });
			});
			
			// Check if we need price input or can transfer directly
			setTimeout(() => {
				// Ensure all drag states are cleared before showing modal
				setDraggingItem(null);
				setHighlightTarget(null);
				dragScale.setValue(1);
				dragOpacity.setValue(1);
				dragRotation.setValue(0);
				dragPos.setValue({ x: 0, y: 0 });
				
				const src = transferSourceRef.current;
				const origin = transferOriginRef.current;
				
				// If moving from China to Brazil, check if item already exists in Brazil with a price
				if (origin === 'main' && src) {
					const currentBrazilStock = brazilStockRef.current;
					const currentPriceMap = priceMapRef.current;
					
					const existsInBrazil = currentBrazilStock.some((item: Article) => item.id === src.id);
					const hasPrice = currentPriceMap[src.id] !== undefined && currentPriceMap[src.id] > 0;
					
					if (existsInBrazil && hasPrice) {
						// Item exists in Brazil with a price - no need for price input
						setNeedsPriceInput(false);
						setTransferPrice(currentPriceMap[src.id].toString());
					} else {
						// New item or no price - need price input
						setNeedsPriceInput(true);
						setTransferPrice('');
					}
				} else {
					// Returning from Brazil to China - never needs price
					setNeedsPriceInput(false);
				}
				
				setTransferModalVisible(true);
			}, 150);
			return;
		}

		// Cancelled - warning haptic
		Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

		// cancelled or no valid target — fade out with bounce
		Animated.parallel([
			Animated.timing(dragOpacity, {
				toValue: 0,
				duration: 250,
				easing: Easing.in(Easing.ease),
				useNativeDriver: false
			}),
			Animated.timing(dragScale, {
				toValue: 0.7,
				duration: 250,
				easing: Easing.in(Easing.back(2)),
				useNativeDriver: false
			}),
			Animated.timing(dragRotation, {
				toValue: 10,
				duration: 250,
				easing: Easing.in(Easing.ease),
				useNativeDriver: false,
			}),
		]).start(() => {
			setDraggingItem(null);
			setHighlightTarget(null);
			transferSourceRef.current = null;
			transferOriginRef.current = null;
			dragScale.setValue(1);
			dragOpacity.setValue(1);
			dragRotation.setValue(0);
			dragPos.setValue({ x: 0, y: 0 });
		});
	};

	// Track modal state in a ref so PanResponder can access current value
	const transferModalVisibleRef = useRef(false);
	useEffect(() => {
		transferModalVisibleRef.current = transferModalVisible;
	}, [transferModalVisible]);

	// create a single PanResponder once; it reads the live previewSize from previewSizeRef
	useEffect(() => {
		if (panResponder.current) return;
		panResponder.current = PanResponder.create({
			onStartShouldSetPanResponder: () => false,
			onStartShouldSetPanResponderCapture: () => false,

			// Grab the gesture as soon as finger moves after long-press - BUT NOT if modal is open
			onMoveShouldSetPanResponder: () => !!transferSourceRef.current && !transferModalVisibleRef.current,
			onMoveShouldSetPanResponderCapture: () => !!transferSourceRef.current && !transferModalVisibleRef.current,
			onPanResponderMove: (_, gs) => {
				// Ignore all moves if modal is open or no item is being dragged
				if (!transferSourceRef.current || transferModalVisibleRef.current) return;
				
				// Optimized position calculation
				const { x: cx, y: cy } = rootOffsetRef.current;
				const { dx, dy } = pressOffsetRef.current;
				const w = previewSizeRef.current.width, h = previewSizeRef.current.height;
				const s = 1.08;
				const cxLocal = w / 2;
				const cyLocal = h / 2;
				const A = gs.moveX - cx;
				const B = gs.moveY - cy;
				const left = A - s * dx + (s - 1) * cxLocal;
				const top = B - s * dy + (s - 1) * cyLocal;
				
				// Direct value setting for immediate response
				dragPos.setValue({ x: left, y: top });
				
				// Minimal tilt for performance
				const tiltAmount = Math.max(-3, Math.min(3, gs.vx * 0.8));
				dragRotation.setValue(tiltAmount);

				// Fast hit detection with early returns
				const x = gs.moveX, y = gs.moveY;
				const origin = transferOriginRef.current;
				let newTarget: 'main' | 'brazil' | null = null;

				if (origin === 'main') {
					const tgt = brazilLayoutRef.current;
					if (tgt && x >= tgt.x && x <= tgt.x + tgt.width && y >= tgt.y && y <= tgt.y + tgt.height) {
						newTarget = 'brazil';
					}
				} else if (origin === 'brazil') {
					const tgt = mainLayout.current;
					if (tgt && x >= tgt.x && x <= tgt.x + tgt.width && y >= tgt.y && y <= tgt.y + tgt.height) {
						newTarget = 'main';
					}
				}

				// Throttled haptic feedback for performance
				if (newTarget !== highlightTarget) {
					const now = Date.now();
					if (now - lastHapticTime.current > 150) {
						if (newTarget) {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						}
						lastHapticTime.current = now;
					}
					setHighlightTarget(newTarget);
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
		// Immediate haptic feedback on pickup
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

		// Set refs immediately but delay state update to avoid flicker
		setDragOrigin(origin);
		transferOriginRef.current = origin;
		transferSourceRef.current = item;

		// Try to measure the actual row so the preview matches its size and position
		// Use origin-specific key to get the correct row ref
		const rowKey = origin === 'main' ? `main-${item.id}` : `brazil-${item.id}`;
		try {
			rowRefs.current[rowKey]?.measureInWindow?.((rx: number, ry: number, rw: number, rh: number) => {
				setPreviewSize({ width: rw, height: rh });
				// store exact local touch offset inside the row (relative to row's top-left)
				pressOffsetRef.current = {
					dx: nativeEvent.pageX - rx,
					dy: nativeEvent.pageY - ry,
				};
				// Convert window coords to overlay coords and position so the same local point sits under the finger
				const { x: cx, y: cy } = rootOffsetRef.current;
				const s = 1.08;
				const cxLocal = rw / 2;
				const cyLocal = rh / 2;
				const A = nativeEvent.pageX - cx;
				const B = nativeEvent.pageY - cy;
				const left = A - s * pressOffsetRef.current.dx + (s - 1) * cxLocal;
				const top = B - s * pressOffsetRef.current.dy + (s - 1) * cyLocal;
				dragPos.setValue({ x: left, y: top });

				// Enhanced pick-up animation with spring effect
				dragScale.setValue(1);
				dragOpacity.setValue(0.9);
				dragRotation.setValue(0);
				Animated.parallel([
					Animated.spring(dragScale, {
						toValue: s,
						friction: 7,
						tension: 50,
						useNativeDriver: false
					}),
					Animated.timing(dragOpacity, {
						toValue: 0.95,
						duration: 150,
						easing: Easing.out(Easing.ease),
						useNativeDriver: false
					}),
				]).start();

				// Hide original item only after preview is positioned
				requestAnimationFrame(() => {
					setDraggingItem(item);
				});

				// measure section bounds for hit-testing
				try {
					mainRef.current?.measureInWindow?.((x: number, y: number, w: number, h: number) => { mainLayout.current = { x, y, width: w, height: h }; });
					brazilRef.current?.measureInWindow?.((x: number, y: number, w: number, h: number) => { brazilLayoutRef.current = { x, y, width: w, height: h }; });
				} catch { }
			});
		} catch {
			// fallback: assume the press was near center of the preview
			pressOffsetRef.current = { dx: previewSize.width / 2, dy: previewSize.height / 2 };
			const { x: cx, y: cy } = rootOffsetRef.current;
			const s = 1.08;
			const cxLocal = previewSize.width / 2;
			const cyLocal = previewSize.height / 2;
			const A = nativeEvent.pageX - cx;
			const B = nativeEvent.pageY - cy;
			const left = A - s * pressOffsetRef.current.dx + (s - 1) * cxLocal;
			const top = B - s * pressOffsetRef.current.dy + (s - 1) * cyLocal;
			dragPos.setValue({ x: left, y: top });
			// Enhanced pick-up animation
			dragScale.setValue(1);
			dragOpacity.setValue(0.9);
			Animated.spring(dragScale, {
				toValue: s,
				friction: 7,
				tension: 50,
				useNativeDriver: false
			}).start();
			
			// Hide original item after preview is positioned
			requestAnimationFrame(() => {
				setDraggingItem(item);
			});
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

	// Live validation as user types
	const handleQtyChange = (text: string) => {
		setTransferQty(text);
		
		const qty = parseInt(text || '0', 10);
		const maxQty = transferSourceRef.current?.quantity || 0;
		
		if (text === '') {
			setQtyWarning('');
		} else if (isNaN(qty) || qty <= 0) {
			setQtyWarning(t('brazil.alert.qtyMustBePositive'));
		} else if (qty > maxQty) {
			setQtyWarning(t('brazil.alert.qtyExceedsMax', { max: maxQty }));
		} else {
			setQtyWarning('');
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
		
		// Validate quantity
		if (isNaN(qty) || qty <= 0) {
			return Alert.alert(t('brazil.alert.invalidQty'), t('brazil.alert.qtyMustBePositive'));
		}
		if (qty > src.quantity) {
			return Alert.alert(t('brazil.alert.invalidQty'), t('brazil.alert.qtyExceedsMax', { max: src.quantity }));
		}
		
		// Validate price only when moving from China to Brazil AND we need price input (item doesn't exist in Brazil yet)
		if (dragOrigin === 'main' && needsPriceInput && (isNaN(price) || price < 0)) {
			return Alert.alert(t('brazil.alert.invalidPrice'), t('brazil.alert.priceMustBePositive'));
		}
		
		try {
			if (dragOrigin === 'main') {
				// Moving from China to Brazil: set price (only if we needed price input, otherwise use existing)
				await moveToSecondary(src.id, qty);
				if (needsPriceInput) {
					await setPrice(src.id, price);
				}
				// If not needsPriceInput, the price already exists in Brazil, so we don't update it
			} else if (dragOrigin === 'brazil') {
				// Returning from Brazil to China: no price needed
				await returnToMain(src.id, qty);
			}
			
			// Complete cleanup of all states
			setTransferModalVisible(false);
			setHighlightTarget(null);
			setDraggingItem(null);
			transferSourceRef.current = null;
			transferOriginRef.current = null;
			setDragOrigin(null);
			setQtyWarning('');
			setNeedsPriceInput(false);
			setTransferQty('');
			setTransferPrice('');
			// Reset animation values
			dragScale.setValue(1);
			dragOpacity.setValue(1);
			dragRotation.setValue(0);
			dragPos.setValue({ x: 0, y: 0 });
			
			await loadData();
		} catch (e: any) {
			Alert.alert(t('brazil.alert.transferFailed'), e.message);
		}
	};

	return (
		<SafeAreaView
			ref={rootRef}
			collapsable={false}
			{...(panResponder.current && !transferModalVisible && !priceModalVisible ? panResponder.current.panHandlers : {})}
			onLayout={() => {
				try {
					rootRef.current?.measureInWindow?.((x: number, y: number) => {
						rootOffsetRef.current = { x, y };
					});
				} catch { }
			}}
			style={[styles.container, { backgroundColor: theme.background }]}
		>
			<KeyboardAvoidingView style={styles.container} behavior={Platform.select({ ios: 'padding' })}>
				<View ref={mainRef} collapsable={false} onLayout={onMainLayout} style={[
					styles.sectionContainer,
					{ backgroundColor: theme.card, marginBottom: 0 },
					(highlightTarget === 'main' && !transferModalVisible && !priceModalVisible) ? {
						borderColor: theme.primary,
						borderWidth: 3,
						backgroundColor: `${theme.primary}15`, // Slight tint
						shadowColor: theme.primary,
						shadowOpacity: 0.3,
						shadowRadius: 10,
						elevation: 8,
					} : {}
				]}>
					<Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('brazil.chinaStock')}</Text>
					<FlatList
						data={mainStock.filter(a => a.quantity > 0)}
						keyExtractor={i => `main-${i.id}`}
						renderItem={renderMoveItem}
						style={styles.listScroll}
						showsVerticalScrollIndicator={false}
						keyboardShouldPersistTaps="handled"
						keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
						scrollEnabled={!draggingItem}
						removeClippedSubviews={Platform.OS === 'android'}
						windowSize={5}
						initialNumToRender={10}
						maxToRenderPerBatch={8}
						updateCellsBatchingPeriod={100}
						getItemLayout={(data, index) => ({
							length: 64,
							offset: 64 * index,
							index,
						})}
					/>
					<View style={[styles.footerBar, { borderTopColor: theme.border }]}>
						<FontAwesome name="cubes" size={18} color={theme.accent} />
						<Text style={[styles.footerText, { color: theme.text }]}>{t('brazil.footer.items', { count: mainTotalQty })}</Text>
					</View>
				</View>

				<View ref={brazilRef} collapsable={false} onLayout={onBrazilLayout} style={[
					styles.sectionContainer,
					{ backgroundColor: theme.card },
					(highlightTarget === 'brazil' && !transferModalVisible && !priceModalVisible) ? {
						borderColor: theme.primary,
						borderWidth: 3,
						backgroundColor: `${theme.primary}15`, // Slight tint
						shadowColor: theme.primary,
						shadowOpacity: 0.3,
						shadowRadius: 10,
						elevation: 8,
					} : {}
				]}>
					<Text style={[styles.heading, { color: theme.primary }]}>{t('brazil.brazilStock')}</Text>
					<FlatList
						data={brazilStock.filter(a => a.quantity > 0)}
						keyExtractor={i => `brazil-${i.id}`}
						renderItem={renderViewItem}
						style={styles.listScroll}
						showsVerticalScrollIndicator={false}
						keyboardShouldPersistTaps="handled"
						keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
						scrollEnabled={!draggingItem}
						removeClippedSubviews={Platform.OS === 'android'}
						windowSize={5}
						initialNumToRender={10}
						maxToRenderPerBatch={8}
						updateCellsBatchingPeriod={100}
						getItemLayout={(data, index) => ({
							length: 64,
							offset: 64 * index,
							index,
						})}
						extraData={priceMap}
					/>
					<View style={[styles.footerBar, { borderTopColor: theme.border }]}>
						<FontAwesome name="cubes" size={18} color={theme.accent} />
						<Text style={[styles.footerText, { color: theme.text }]}>{t('brazil.footer.pcs', { count: brazilTotalQty })}</Text>
						<FontAwesome name="dollar" size={18} color={theme.accent} style={{ marginLeft: 20 }} />
						<Text style={[styles.footerText, { color: theme.text }]}>{`${brazilTotalVal.toFixed(2)}`}</Text>
					</View>
				</View>

				{/* Enhanced drag preview overlay with rotation */}
				{draggingItem ? (
					<View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 9999 }} pointerEvents="box-none">
						{draggingItem ? (
							<Animated.View
								pointerEvents="none"
								style={{
									position: 'absolute',
									left: (dragPos as any).x,
									top: (dragPos as any).y,
									transform: [
										{ scale: dragScale },
										{
											rotate: dragRotation.interpolate({
												inputRange: [-10, 0, 10],
												outputRange: ['-3deg', '0deg', '3deg'],
											})
										}
									],
									opacity: dragOpacity,
									zIndex: 10000
								}}
							>
								<View style={[
									{
										flexDirection: 'row',
										alignItems: 'center',
										width: previewSize.width,
										height: previewSize.height,
										paddingHorizontal: 14,
										paddingVertical: 12,
										borderRadius: 14,
										backgroundColor: theme.card,
										borderWidth: 2,
										borderColor: theme.primary,
										shadowColor: theme.shadow,
										shadowOffset: { width: 0, height: 8 },
										shadowOpacity: 0.3,
										shadowRadius: 16,
										elevation: 12,
									}
								]}>
									<FontAwesome name="archive" size={20} color={theme.accent} style={{ marginRight: 10 }} />
									<Text style={[{ flex: 1, fontSize: 16, fontWeight: '700', letterSpacing: 0.2, color: theme.text }]} numberOfLines={1}>
										{draggingItem.name}
									</Text>
									<View style={[{
										paddingVertical: 6,
										paddingHorizontal: 10,
										borderRadius: 999,
										minWidth: 34,
										alignItems: 'center',
										justifyContent: 'center',
										marginRight: 8,
										backgroundColor: theme.accent,
									}]}>
										<Text style={{ color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.2 }}>{draggingItem.quantity}</Text>
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
							{/* Enhanced modal header */}
							<View style={styles.modalHeader}>
								<View style={[styles.modalIconContainer, { backgroundColor: theme.primary + '15' }]}>
									<FontAwesome name="exchange" size={32} color={theme.primary} />
								</View>
								<Text style={[styles.modalTitle, { color: theme.primary }]}>{t('brazil.transfer.title')}</Text>
								<View style={[styles.modalDivider, { backgroundColor: theme.primary }]} />
							</View>

							{/* Item name and max quantity display */}
							{transferSourceRef.current && (
								<View style={styles.modalItemInfo}>
									<Text style={[styles.modalItemName, { color: theme.text }]}>{transferSourceRef.current.name}</Text>
									<Pressable 
										onPress={() => {
											if (transferSourceRef.current) {
												setTransferQty(transferSourceRef.current.quantity.toString());
												setQtyWarning('');
											}
										}}
										style={({ pressed }) => [
											styles.maxQtyBadge, 
											{ 
												backgroundColor: theme.accent + '15', 
												borderColor: theme.accent,
												opacity: pressed ? 0.7 : 1
											}
										]}
									>
										<FontAwesome name="archive" size={12} color={theme.accent} style={{ marginRight: 4 }} />
										<Text style={[styles.maxQtyText, { color: theme.accent }]}>
											{t('brazil.transfer.maxAvailable', { max: transferSourceRef.current.quantity })}
										</Text>
									</Pressable>
								</View>
							)}

							{/* Enhanced input fields */}
							<View style={styles.modalInputContainer}>
								<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
									<FontAwesome name="cubes" size={14} color={theme.text} style={{ marginRight: 6 }} />
									<Text style={[styles.inputLabel, { color: theme.text, marginBottom: 0 }]}>{t('brazil.placeholder.qty')}</Text>
								</View>
								<TextInput
									style={[
										styles.modalInput, 
										{ 
											borderColor: qtyWarning ? '#e74c3c' : theme.primary + '30', 
											backgroundColor: qtyWarning ? '#e74c3c15' : theme.primary + '05', 
											color: theme.text 
										}
									]}
									placeholder={t('brazil.placeholder.qty')}
									placeholderTextColor={theme.placeholder}
									keyboardType="number-pad"
									value={transferQty}
									onChangeText={handleQtyChange}
								/>
								{qtyWarning !== '' && (
									<View style={styles.warningContainer}>
										<FontAwesome name="exclamation-triangle" size={12} color="#e74c3c" style={{ marginRight: 6 }} />
										<Text style={styles.warningText}>{qtyWarning}</Text>
									</View>
								)}
							</View>

							{/* Only show price input when moving from China to Brazil AND item doesn't exist in Brazil yet */}
							{dragOrigin === 'main' && needsPriceInput && (
								<View style={styles.modalInputContainer}>
									<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
										<FontAwesome name="dollar" size={14} color={theme.text} style={{ marginRight: 6 }} />
										<Text style={[styles.inputLabel, { color: theme.text, marginBottom: 0 }]}>{t('brazil.placeholder.unitPrice')}</Text>
									</View>
									<TextInput
										style={[styles.modalInput, { borderColor: theme.primary + '30', backgroundColor: theme.primary + '05', color: theme.text }]}
										placeholder={t('brazil.placeholder.unitPrice')}
										placeholderTextColor={theme.placeholder}
										keyboardType={Platform.select({ ios: 'decimal-pad', android: 'number-pad' })}
										value={transferPrice}
										onChangeText={setTransferPrice}
									/>
								</View>
							)}

							{/* Enhanced action buttons */}
							<View style={styles.modalActions}>
								<Pressable
									onPress={() => { 
										// Complete cleanup of all drag and transfer states
										setTransferModalVisible(false); 
										setHighlightTarget(null);
										setDraggingItem(null);
										transferSourceRef.current = null; 
										transferOriginRef.current = null; 
										setDragOrigin(null); 
										setQtyWarning('');
										setNeedsPriceInput(false);
										setTransferQty('');
										setTransferPrice('');
										// Reset animation values
										dragScale.setValue(1);
										dragOpacity.setValue(1);
										dragRotation.setValue(0);
										dragPos.setValue({ x: 0, y: 0 });
									}}
									style={({ pressed }) => [
										styles.modalBtn,
										styles.modalCancelBtn,
										{ borderWidth: 2, borderColor: theme.border, opacity: pressed ? 0.7 : 1 }
									]}
								>
									<FontAwesome name="times" size={14} color={theme.text} style={{ marginRight: 6 }} />
									<Text style={[styles.modalBtnText, { color: theme.text }]}>{t('common.cancel')}</Text>
								</Pressable>
								<Pressable
									onPress={validateAndPerformTransfer}
									style={({ pressed }) => [
										styles.modalBtn,
										styles.modalSaveBtn,
										{ backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 }
									]}
								>
									<FontAwesome name="check" size={14} color="#fff" style={{ marginRight: 6 }} />
									<Text style={[styles.modalBtnText, { color: '#fff' }]}>{t('common.save')}</Text>
								</Pressable>
							</View>
						</View>
					</View>
				</Modal>

				<Modal visible={priceModalVisible} transparent animationType="slide" onRequestClose={() => { setPriceModalVisible(false); }}>
					<View style={styles.modalOverlay}>
						<View style={[styles.modalContent, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
							{/* Enhanced modal header */}
							<View style={styles.modalHeader}>
								<View style={[styles.modalIconContainer, { backgroundColor: theme.primary + '15' }]}>
									<FontAwesome name="tag" size={32} color={theme.primary} />
								</View>
								<Text style={[styles.modalTitle, { color: theme.primary }]}>{t('brazil.setPrice', { name: priceModalArticle?.name })}</Text>
								<View style={[styles.modalDivider, { backgroundColor: theme.primary }]} />
							</View>

							{/* Enhanced input field */}
							<View style={styles.modalInputContainer}>
								<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
									<FontAwesome name="dollar" size={14} color={theme.text} style={{ marginRight: 6 }} />
									<Text style={[styles.inputLabel, { color: theme.text, marginBottom: 0 }]}>{t('brazil.placeholder.unitPrice')}</Text>
								</View>
								<TextInput
									style={[styles.modalInput, { borderColor: theme.primary + '30', backgroundColor: theme.primary + '05', color: theme.text }]}
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
							</View>

							{/* Enhanced action buttons */}
							<View style={styles.modalActions}>
								<Pressable
									onPress={() => setPriceModalVisible(false)}
									style={({ pressed }) => [
										styles.modalBtn,
										styles.modalCancelBtn,
										{ borderWidth: 2, borderColor: theme.border, opacity: pressed ? 0.7 : 1 }
									]}
								>
									<FontAwesome name="times" size={14} color={theme.text} style={{ marginRight: 6 }} />
									<Text style={[styles.modalBtnText, { color: theme.text }]}>{t('common.cancel')}</Text>
								</Pressable>
								<Pressable
									onPress={onSavePrice}
									style={({ pressed }) => [
										styles.modalBtn,
										styles.modalSaveBtn,
										{ backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 }
									]}
								>
									<FontAwesome name="check" size={14} color="#fff" style={{ marginRight: 6 }} />
									<Text style={[styles.modalBtnText, { color: '#fff' }]}>{t('common.save')}</Text>
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

	// Modal - Enhanced
	modalOverlay: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: 'rgba(0,0,0,0.5)',
		padding: 20,
	},
	modalContent: {
		width: '100%',
		maxWidth: 420,
		borderRadius: 20,
		padding: 24,
		elevation: 8,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 12,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: '900',
		marginBottom: 0,
		letterSpacing: 0.3,
		textAlign: 'center',
	},
	modalInput: {
		borderWidth: 2,
		borderRadius: 12,
		paddingVertical: 14,
		paddingHorizontal: 16,
		fontSize: 16,
		fontWeight: '600',
	},

	// Amount cells (unit price / total) — keep on one line and avoid wrapping
	cellAmount: {
		minWidth: 72,
		textAlign: 'center',
		fontSize: 16,
		flexShrink: 0,
	},
	priceColumn: {
		minWidth: 88,
		alignItems: 'center',
		marginLeft: 8,
	},
	priceLabel: {
		fontSize: 10,
		fontWeight: '600',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
		marginBottom: 2,
		opacity: 0.7,
	},
	priceValue: {
		fontSize: 14,
		fontWeight: '700',
		letterSpacing: 0.2,
	},
	modalActions: {
		flexDirection: 'row',
		justifyContent: 'flex-end',
		marginTop: 8,
		gap: 10,
	},
	modalBtn: {
		flexDirection: 'row',
		paddingVertical: 12,
		paddingHorizontal: 20,
		borderRadius: 12,
		minWidth: 100,
		alignItems: 'center',
	},
	modalHeader: {
		alignItems: 'center',
		marginBottom: 20,
		paddingBottom: 16,
		borderBottomWidth: 2,
		borderBottomColor: 'rgba(0,0,0,0.05)',
	},
	modalIconContainer: {
		width: 72,
		height: 72,
		borderRadius: 36,
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 12,
	},
	modalDivider: {
		width: 60,
		height: 3,
		borderRadius: 2,
		marginTop: 12,
		opacity: 0.8,
	},
	modalItemInfo: {
		marginBottom: 20,
		alignItems: 'center',
	},
	modalItemName: {
		fontSize: 16,
		fontWeight: '700',
		marginBottom: 10,
		textAlign: 'center',
	},
	maxQtyBadge: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderRadius: 20,
		borderWidth: 1.5,
	},
	maxQtyText: {
		fontSize: 13,
		fontWeight: '700',
		letterSpacing: 0.3,
	},
	modalInputContainer: {
		marginBottom: 18,
	},
	inputLabel: {
		fontSize: 14,
		fontWeight: '700',
		marginBottom: 8,
		letterSpacing: 0.2,
		opacity: 0.9,
	},
	warningContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: 8,
		paddingHorizontal: 12,
		paddingVertical: 8,
		backgroundColor: '#e74c3c15',
		borderRadius: 8,
		borderLeftWidth: 3,
		borderLeftColor: '#e74c3c',
	},
	warningText: {
		fontSize: 12,
		color: '#e74c3c',
		fontWeight: '600',
		flex: 1,
	},
	modalBtnText: {
		fontSize: 14,
		fontWeight: '700',
		letterSpacing: 0.3,
	},
	modalCancelBtn: {},
	modalSaveBtn: {
		elevation: 3,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.15,
		shadowRadius: 4,
	},
});
