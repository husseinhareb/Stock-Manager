// src/screens/(tabs)/brazil.tsx
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import BrazilMap from '@/components/BrazilMap';

export default function BrazilScreen() {
	return (
		<SafeAreaView style={{ flex: 1 }}>
			<BrazilMap />
		</SafeAreaView>
	);
}
