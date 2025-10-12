// app/_layout.tsx
// Must import gesture handler at the very top before any navigation imports
import 'react-native-gesture-handler';
import { Colors } from '@/constants/Colors';
import '../i18n';
import i18n from '../i18n';
import { FontAwesome } from '@expo/vector-icons';
import { Drawer } from 'expo-router/drawer';
import React from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { ThemeProvider } from '@/src/theme/ThemeProvider';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function RootLayout() {
  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <ThemedDrawer />
      </ThemeProvider>
    </I18nextProvider>
  );
}

function ThemedDrawer() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const theme = Colors[scheme];

  return (
    <Drawer
      initialRouteName="(tabs)"
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: theme.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        drawerStyle: { backgroundColor: theme.card },
        drawerActiveTintColor: theme.accent,
        drawerInactiveTintColor: theme.text,
        drawerLabelStyle: { fontSize: 16 },
      }}
    >
      <Drawer.Screen
        name="(tabs)"
        options={{
          title: t('screens.home'),
          drawerIcon: ({ color, size }) => <FontAwesome name="home" size={size} color={color} />,
        }}
      />
      <Drawer.Screen
        name="settings"
        options={{
          title: t('screens.settings'),
          drawerIcon: ({ color, size }) => <FontAwesome name="cog" size={size} color={color} />,
        }}
      />
    </Drawer>
  );
}
