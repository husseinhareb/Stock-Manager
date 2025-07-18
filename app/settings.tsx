import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Pressable,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { useI18n } from '../i18n/I18nProvider';
import { t } from '../i18n';

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
];

const THEMES: Array<'system' | 'light' | 'dark'> = [
  'system',
  'light',
  'dark',
];

export default function SettingsScreen() {
  const systemScheme = useColorScheme();
  const [themePref, setThemePref] = useState<'system' | 'light' | 'dark'>(
    'system'
  );
  const effectiveScheme =
    themePref === 'system' ? systemScheme : themePref;
  const theme = Colors[effectiveScheme ?? 'light'];

  const { locale, setLocale } = useI18n();
  const [notifications, setNotifications] = useState(false);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [langModalVisible, setLangModalVisible] = useState(false);

  const toggleNotifications = (val: boolean) => {
    setNotifications(val);
    // TODO: persist notifications setting
  };

  const onSignOut = () => {
    // TODO: implement real sign-out logic
    alert(t('sign_out'));
  };

  const currentLang =
    LANGS.find((l) => l.code === locale)?.label ?? locale;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {/* Notifications */}
        <View style={[styles.row, { borderColor: theme.border }]}>
          <MaterialIcons
            name="notifications"
            size={24}
            color={theme.accent}
            style={styles.icon}
          />
          <Text style={[styles.label, { color: theme.text }]}>
            {t('notifications')}
          </Text>
          <Switch
            value={notifications}
            onValueChange={toggleNotifications}
            trackColor={{
              true: theme.accent,
              false: theme.border,
            }}
            thumbColor={
              notifications ? theme.primary : theme.text
            }
          />
        </View>

        {/* Theme Picker */}
        <TouchableOpacity
          onPress={() => setThemeModalVisible(true)}
          style={[styles.row, { borderColor: theme.border }]}
        >
          <MaterialIcons
            name="brightness-6"
            size={24}
            color={theme.accent}
            style={styles.icon}
          />
          <Text style={[styles.label, { color: theme.text }]}>
            {t('theme')}
          </Text>
          <Text style={[styles.value, { color: theme.text }]}>
            {themePref.charAt(0).toUpperCase() +
              themePref.slice(1)}
          </Text>
          <FontAwesome
            name="angle-right"
            size={20}
            color={theme.text}
          />
        </TouchableOpacity>

        {/* Language Picker */}
        <TouchableOpacity
          onPress={() => setLangModalVisible(true)}
          style={[styles.row, { borderColor: theme.border }]}
        >
          <MaterialIcons
            name="language"
            size={24}
            color={theme.accent}
            style={styles.icon}
          />
          <Text style={[styles.label, { color: theme.text }]}>
            {t('language')}
          </Text>
          <Text style={[styles.value, { color: theme.text }]}>
            {currentLang}
          </Text>
          <FontAwesome
            name="angle-right"
            size={20}
            color={theme.text}
          />
        </TouchableOpacity>

        {/* Sign Out */}
        <TouchableOpacity
          onPress={onSignOut}
          style={[styles.row, { borderColor: theme.border }]}
        >
          <MaterialIcons
            name="logout"
            size={24}
            color={theme.accent}
            style={styles.icon}
          />
          <Text style={[styles.label, { color: theme.text }]}>
            {t('sign_out')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Theme Modal */}
      <Modal
        visible={themeModalVisible}
        transparent
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalBox,
              {
                backgroundColor: theme.card,
                shadowColor: theme.shadow,
              },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: theme.primary },
              ]}
            >
              {t('theme')}
            </Text>
            {THEMES.map((opt) => (
              <Pressable
                key={opt}
                style={styles.optionRow}
                onPress={() => {
                  setThemePref(opt);
                  setThemeModalVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: theme.text },
                  ]}
                >
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </Text>
                {themePref === opt && (
                  <FontAwesome
                    name="check"
                    size={18}
                    color={theme.accent}
                  />
                )}
              </Pressable>
            ))}
            <Pressable
              onPress={() => setThemeModalVisible(false)}
              style={[
                styles.modalBtn,
                { backgroundColor: theme.accent },
              ]}
            >
              <Text style={{ color: '#fff' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Language Modal */}
      <Modal
        visible={langModalVisible}
        transparent
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalBox,
              {
                backgroundColor: theme.card,
                shadowColor: theme.shadow,
              },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: theme.primary },
              ]}
            >
              {t('language')}
            </Text>
            {LANGS.map((opt) => (
              <Pressable
                key={opt.code}
                style={styles.optionRow}
                onPress={() => {
                  setLocale(opt.code);
                  setLangModalVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: theme.text },
                  ]}
                >
                  {opt.label}
                </Text>
                {locale === opt.code && (
                  <FontAwesome
                    name="check"
                    size={18}
                    color={theme.accent}
                  />
                )}
              </Pressable>
            ))}
            <Pressable
              onPress={() => setLangModalVisible(false)}
              style={[
                styles.modalBtn,
                { backgroundColor: theme.accent },
              ]}
            >
              <Text style={{ color: '#fff' }}>Cancel</Text>
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
});
