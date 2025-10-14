// src/screens/(tabs)/brazil.tsx
import BrazilMap from '@/components/BrazilMap';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function BrazilScreen() {
	return (
		<SafeAreaView style={{ flex: 1 }}>
			<BrazilMap />
		</SafeAreaView>
	);
}
