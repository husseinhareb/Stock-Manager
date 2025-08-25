// app/screens/SettingsScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { useColorScheme, useThemePref } from '@/hooks/useColorScheme'; // <-- use global theme context
import { Colors } from '@/constants/Colors';
import { useTranslation } from 'react-i18next';
import { saveSetting, getSetting } from '../src/db';

const LANGS = [
  { code: 'en', labelKey: 'settings.languageOptions.en' },
  { code: 'es', labelKey: 'settings.languageOptions.es' },
  { code: 'fr', labelKey: 'settings.languageOptions.fr' },
  { code: 'ar', labelKey: 'settings.languageOptions.ar' },
];

const THEMES: Array<'system' | 'light' | 'dark'> = ['system', 'light', 'dark'];

const CURRENCIES = [
  { code: 'USD', symbol: '$', labelKey: 'settings.currencyOptions.usd' },
  { code: 'EUR', symbol: '€', labelKey: 'settings.currencyOptions.eur' },
  { code: 'GBP', symbol: '£', labelKey: 'settings.currencyOptions.gbp' },
  { code: 'JPY', symbol: '¥', labelKey: 'settings.currencyOptions.jpy' },
  { code: 'CAD', symbol: 'C$', labelKey: 'settings.currencyOptions.cad' },
  { code: 'AUD', symbol: 'A$', labelKey: 'settings.currencyOptions.aud' },
  { code: 'CHF', symbol: 'CHF', labelKey: 'settings.currencyOptions.chf' },
  { code: 'CNY', symbol: '¥', labelKey: 'settings.currencyOptions.cny' },
  { code: 'BRL', symbol: 'R$', labelKey: 'settings.currencyOptions.brl' },
];

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();

  // Effective scheme ('light' | 'dark') from provider (follows pref + system)
  const scheme = useColorScheme();
  const theme = Colors[scheme];

  // Current theme preference ('system' | 'light' | 'dark') + setter from provider
  const { pref: themePref, setPref } = useThemePref();

  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load currency & language once (theme pref is handled by provider)
  useEffect(() => {
    (async () => {
      try {
        const [currency, language] = await Promise.all([
          getSetting('currency', 'USD'),
          getSetting('language', 'en'),
        ]);
        setSelectedCurrency(currency);
        if (language !== i18n.language) i18n.changeLanguage(language);
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [i18n]);

  const handleThemeSelect = async (opt: 'system' | 'light' | 'dark') => {
    setThemeModalVisible(false);
    await setPref(opt); // provider saves & broadcasts change app-wide
  };

  const handleLanguageSelect = async (code: string) => {
    i18n.changeLanguage(code);
    setLangModalVisible(false);
    try {
      await saveSetting('language', code);
    } catch (error) {
      console.error('Failed to save language setting:', error);
    }
  };

  const handleCurrencySelect = async (code: string) => {
    setSelectedCurrency(code);
    setCurrencyModalVisible(false);
    try {
      await saveSetting('currency', code);
    } catch (error) {
      console.error('Failed to save currency setting:', error);
    }
  };

  const handleQuit = () => {
    // TODO: implement quit functionality
    console.log('Quit app');
  };

  const getCurrentCurrency = () =>
    CURRENCIES.find(c => c.code === selectedCurrency) || CURRENCIES[0];

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.text }]}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Theme Picker */}
        <TouchableOpacity
          onPress={() => setThemeModalVisible(true)}
          style={[styles.row, { borderColor: theme.border }]}
        >
          <MaterialIcons name="brightness-6" size={24} color={theme.accent} style={styles.icon} />
          <Text style={[styles.label, { color: theme.text }]}>{t('settings.theme')}</Text>
          <Text style={[styles.value, { color: theme.text }]}>
            {t(`settings.themeOptions.${themePref}`)}
          </Text>
          <FontAwesome name="angle-right" size={20} color={theme.text} />
        </TouchableOpacity>

        {/* Language Picker */}
        <TouchableOpacity
          onPress={() => setLangModalVisible(true)}
          style={[styles.row, { borderColor: theme.border }]}
        >
          <MaterialIcons name="language" size={24} color={theme.accent} style={styles.icon} />
          <Text style={[styles.label, { color: theme.text }]}>{t('settings.language')}</Text>
          <Text style={[styles.value, { color: theme.text }]}>
            {t(LANGS.find(l => l.code === i18n.language)!.labelKey)}
          </Text>
          <FontAwesome name="angle-right" size={20} color={theme.text} />
        </TouchableOpacity>

        {/* Currency Picker */}
        <TouchableOpacity
          onPress={() => setCurrencyModalVisible(true)}
          style={[styles.row, { borderColor: theme.border }]}
        >
          <MaterialIcons name="attach-money" size={24} color={theme.accent} style={styles.icon} />
          <Text style={[styles.label, { color: theme.text }]}>{t('settings.currency')}</Text>
          <Text style={[styles.value, { color: theme.text }]}>
            {getCurrentCurrency().symbol} - {t(getCurrentCurrency().labelKey)}
          </Text>
          <FontAwesome name="angle-right" size={20} color={theme.text} />
        </TouchableOpacity>

        {/* Quit */}
        <TouchableOpacity onPress={handleQuit} style={[styles.row, { borderColor: theme.border }]}>
          <MaterialIcons name="exit-to-app" size={24} color={theme.accent} style={styles.icon} />
          <Text style={[styles.label, { color: theme.text }]}>{t('settings.quit')}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Theme Modal */}
      <Modal visible={themeModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
            <Text style={[styles.modalTitle, { color: theme.primary }]}>{t('settings.selectTheme')}</Text>
            {THEMES.map(opt => (
              <Pressable key={opt} style={styles.optionRow} onPress={() => handleThemeSelect(opt)}>
                <Text style={[styles.optionText, { color: theme.text }]}>
                  {t(`settings.themeOptions.${opt}`)}
                </Text>
                {themePref === opt && <FontAwesome name="check" size={18} color={theme.accent} />}
              </Pressable>
            ))}
            <Pressable
              onPress={() => setThemeModalVisible(false)}
              style={[styles.modalBtn, { backgroundColor: theme.accent }]}
            >
              <Text style={{ color: '#fff' }}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Language Modal */}
      <Modal visible={langModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
            <Text style={[styles.modalTitle, { color: theme.primary }]}>{t('settings.selectLanguage')}</Text>
            {LANGS.map(opt => (
              <Pressable key={opt.code} style={styles.optionRow} onPress={() => handleLanguageSelect(opt.code)}>
                <Text style={[styles.optionText, { color: theme.text }]}>{t(opt.labelKey)}</Text>
                {i18n.language === opt.code && <FontAwesome name="check" size={18} color={theme.accent} />}
              </Pressable>
            ))}
            <Pressable
              onPress={() => setLangModalVisible(false)}
              style={[styles.modalBtn, { backgroundColor: theme.accent }]}
            >
              <Text style={{ color: '#fff' }}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Currency Modal */}
      <Modal visible={currencyModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
            <Text style={[styles.modalTitle, { color: theme.primary }]}>{t('settings.selectCurrency')}</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {CURRENCIES.map(opt => (
                <Pressable key={opt.code} style={styles.optionRow} onPress={() => handleCurrencySelect(opt.code)}>
                  <Text style={[styles.optionText, { color: theme.text }]}>
                    {opt.symbol} - {t(opt.labelKey)}
                  </Text>
                  {selectedCurrency === opt.code && (
                    <FontAwesome name="check" size={18} color={theme.accent} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setCurrencyModalVisible(false)}
              style={[styles.modalBtn, { backgroundColor: theme.accent }]}
            >
              <Text style={{ color: '#fff' }}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingVertical: 8 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  icon: { marginRight: 16 },
  label: { flex: 1, fontSize: 16 },
  value: { marginRight: 8, fontSize: 16 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBox: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 12,
    padding: 20,
    elevation: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  optionText: { fontSize: 16 },
  modalBtn: {
    marginTop: 12,
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 16 },
});
