// Minimal client screen implementation moved to src/screens
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

export default function ClientScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? 'light'];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <Text style={{ color: theme.primary, fontSize: 18 }}>{t('client.title') ?? 'Clients'}</Text>
      <Text style={{ color: theme.text, marginTop: 8 }}>{t('client.subtitle') ?? 'Manage clients and receipts'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 16 } });
