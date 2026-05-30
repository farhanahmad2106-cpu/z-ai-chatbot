import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { Backup } from '../types/chat';
import { SyncService } from '../services/SyncService';

export const BackupScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pinText, setPinText] = useState('');

  const fetchBackups = async () => {
    setIsLoading(true);
    try {
      const list = await SyncService.listBackups();
      setBackups(list);
    } catch (e: any) {
      Alert.alert('Load Failed', e.message || 'Could not fetch backups.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreate = async () => {
    if (pinText.length < 4) {
      Alert.alert('PIN Required', 'Please input your 4-digit session security PIN to derive the key.');
      return;
    }
    const pin = pinText;
    setPinText('');
    setIsLoading(true);
    try {
      await SyncService.createBackup(pin);
      Alert.alert('Success', 'Encrypted local database snapshot created successfully.');
      await fetchBackups();
    } catch (e: any) {
      Alert.alert('Backup Failed', e.message || 'Cryptographic write failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (filename: string) => {
    if (pinText.length < 4) {
      Alert.alert('PIN Required', 'Please input your session security PIN.');
      return;
    }
    const pin = pinText;
    setPinText('');
    try {
      const res = await SyncService.verifyBackup(filename, pin);
      if (res.is_valid) {
        Alert.alert('Integrity Verified', 'SHA-256 matches & GCM decryption headers are fully valid.');
      } else {
        Alert.alert('Corrupt Archive', 'GCM Decryption verification failed. The key is incorrect or the payload is modified.');
      }
    } catch (e: any) {
      Alert.alert('Verification Failed', e.message || 'Operation failed.');
    }
  };

  const handleRestore = (filename: string) => {
    if (pinText.length < 4) {
      Alert.alert('PIN Required', 'Please input your session security PIN.');
      return;
    }
    const pin = pinText;
    setPinText('');

    Alert.alert(
      'Confirm Restore',
      'Restoring will fully OVERWRITE your active database context and refresh the application session. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore Now',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              await SyncService.restoreBackup(filename, pin);
              Alert.alert('Success', 'Database restored cleanly. Session re-initialized.');
              // Reset to Unlock screen
              navigation.reset({
                index: 0,
                routes: [{ name: 'Unlock' }],
              });
            } catch (e: any) {
              Alert.alert('Restore Failed', e.message || 'File overwrite failed.');
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity 
          onPress={() => navigation.openDrawer()}
          style={styles.menuBtn}
        >
          <Text style={styles.menuText}>[=]</Text>
        </TouchableOpacity>
        <Text style={styles.title}>BACKUP UTILITIES</Text>
        <TouchableOpacity style={styles.syncBtn} onPress={() => fetchBackups()}>
          <Text style={styles.syncBtnText}>REFRESH</Text>
        </TouchableOpacity>
      </View>

      {isLoading && backups.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Connecting secure backups context...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          
          {/* Card: Authorize Backups */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>CRYPTO-AUTHENTICATED SNAPSHOT</Text>
            <Text style={styles.cardDesc}>
              Creates a local compressed database snapshot encrypted with **AES-256-GCM** using a key derived from your secure PIN. Backups are saved inside `data/backups`.
            </Text>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Input Session PIN to Authorize..."
                placeholderTextColor={theme.colors.onSurfaceVariant}
                value={pinText}
                onChangeText={setPinText}
                secureTextEntry
                keyboardType="numeric"
                maxLength={12}
              />
              <TouchableOpacity style={styles.actionBtn} onPress={handleCreate}>
                <Text style={styles.actionBtnText}>CREATE SNAPSHOT</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Backup History */}
          <Text style={styles.sectionTitle}>ARCHIVE LOGS ON DISK</Text>
          {backups.length === 0 ? (
            <Text style={styles.emptyText}>No encrypted backup archives recorded on this system.</Text>
          ) : (
            backups.map((bak) => (
              <View key={bak.id} style={styles.backupCard}>
                <View style={styles.backupInfo}>
                  <Text style={styles.backupName} numberOfLines={1}>{bak.filename}</Text>
                  <Text style={styles.backupMetrics}>
                    Conversations: {bak.conversation_count} | Turns: {bak.message_count}
                  </Text>
                  <Text style={styles.backupSize}>
                    Size: {(bak.size_bytes / 1024).toFixed(1)} KB | Date: {new Date(bak.created_at).toLocaleString()}
                  </Text>
                </View>
                
                <View style={styles.actionCol}>
                  <TouchableOpacity
                    style={[styles.miniBtn, styles.btnVerify]}
                    onPress={() => handleVerify(bak.filename)}
                  >
                    <Text style={styles.miniBtnText}>VERIFY</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.miniBtn, styles.btnRestore]}
                    onPress={() => handleRestore(bak.filename)}
                  >
                    <Text style={styles.miniBtnText}>RESTORE</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.gutter,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
    backgroundColor: theme.colors.surface,
  },
  menuBtn: {
    padding: 8,
  },
  menuText: {
    color: theme.colors.onSurface,
    fontWeight: 'bold',
    fontSize: 16,
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
    letterSpacing: 0.5,
  },
  syncBtn: {
    padding: 8,
  },
  syncBtnText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.gutter,
    gap: 16,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loadingText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.outline,
    padding: 16,
  },
  cardHeader: {
    fontSize: 11,
    fontWeight: 'bold',
    color: theme.colors.onSurfaceVariant,
    marginBottom: 12,
    letterSpacing: 1,
  },
  cardDesc: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    lineHeight: 19,
    marginBottom: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: theme.colors.outline,
    backgroundColor: theme.colors.background,
    height: 42,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    fontSize: 12.5,
    color: theme.colors.onBackground,
    fontFamily: theme.typography.bodyLg.fontFamily,
  },
  actionBtn: {
    height: '100%',
    paddingHorizontal: 14,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: theme.colors.onSurfaceVariant,
    letterSpacing: 1,
    marginTop: 8,
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  backupCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.outline,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backupInfo: {
    flex: 1,
    paddingRight: 12,
  },
  backupName: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
  },
  backupMetrics: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '600',
    marginTop: 3,
  },
  backupSize: {
    fontSize: 11.5,
    color: theme.colors.onSurfaceVariant,
    marginTop: 3,
  },
  actionCol: {
    gap: 6,
    width: 80,
  },
  miniBtn: {
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  btnVerify: {
    borderColor: theme.colors.primary,
    backgroundColor: 'transparent',
  },
  btnRestore: {
    borderColor: theme.colors.error,
    backgroundColor: 'transparent',
  },
  miniBtnText: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
  }
});

export default BackupScreen;
