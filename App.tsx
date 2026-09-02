import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useUpdateManager } from './src/services/updateManager';

export default function App(): React.JSX.Element {
  const {
    isChecking,
    isDownloading,
    isDownloaded,
    updateError,
    manifestInfo,
    applyUpdate,
    dismissUpdate,
    checkForUpdates,
  } = useUpdateManager();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#020617" />

      {/* Main Viewport Container */}
      <View style={styles.content}>
        <View style={styles.headerBox}>
          <Text style={styles.brandTitle}>Z-SEHEALTH</Text>
          <Text style={styles.brandSubtitle}>Edge Intelligence & Nutritional Safety</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mobile Client Status</Text>
          <Text style={styles.cardBody}>
            Runtime: Hermes Engine (React Native Expo)
          </Text>
          <Text style={styles.cardBody}>
            Inference: Local GGUF (llama.cpp) + Convex Cloud Sync
          </Text>
          <Text style={styles.cardBody}>
            Vault: SQLCipher 256-bit Encrypted
          </Text>

          {isChecking && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color="#10B981" />
              <Text style={styles.statusText}>Checking for OTA updates...</Text>
            </View>
          )}

          {isDownloading && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color="#38BDF8" />
              <Text style={styles.statusText}>Downloading latest bundle in background...</Text>
            </View>
          )}

          {updateError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>Notice: {updateError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.manualCheckButton}
            onPress={() => checkForUpdates()}
            disabled={isChecking || isDownloading}
            activeOpacity={0.8}
          >
            <Text style={styles.manualCheckText}>
              {isChecking ? 'Checking...' : 'Check For Updates'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Unobtrusive Floating OTA Update Toast Notification */}
      {isDownloaded && (
        <View style={styles.toastOverlay}>
          <View style={styles.toastContainer}>
            <View style={styles.toastHeader}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>HOTFIX READY</Text>
              </View>
              <Text style={styles.toastRuntime}>
                v{manifestInfo?.runtimeVersion || '1.0.0'} ({manifestInfo?.channel || 'prod'})
              </Text>
            </View>

            <Text style={styles.toastTitle}>Update Downloaded</Text>
            <Text style={styles.toastDescription}>
              A new JavaScript bundle has been downloaded in the background (quote rotation logic & API payload hotfixes).
            </Text>

            <View style={styles.toastActions}>
              <TouchableOpacity
                style={[styles.toastButton, styles.dismissButton]}
                onPress={dismissUpdate}
                activeOpacity={0.8}
              >
                <Text style={styles.dismissButtonText}>Later</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toastButton, styles.reloadButton]}
                onPress={applyUpdate}
                activeOpacity={0.8}
              >
                <Text style={styles.reloadButtonText}>Restart Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617', // slate-950
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  headerBox: {
    marginBottom: 28,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#0F172A', // slate-900
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1E293B', // slate-800
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 12,
  },
  cardBody: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 8,
    lineHeight: 18,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#1E293B',
  },
  statusText: {
    fontSize: 12,
    color: '#E2E8F0',
    fontWeight: '500',
  },
  errorBanner: {
    marginTop: 14,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.3)',
  },
  errorText: {
    fontSize: 12,
    color: '#FDA4AF',
  },
  manualCheckButton: {
    marginTop: 18,
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  manualCheckText: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 13,
  },
  // Floating Toast Notification
  toastOverlay: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  toastContainer: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#10B981', // emerald accent
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  toastHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  badgeText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  toastRuntime: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  toastTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  toastDescription: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 17,
    marginBottom: 14,
  },
  toastActions: {
    flexDirection: 'row',
    gap: 10,
  },
  toastButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButton: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  dismissButtonText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  reloadButton: {
    backgroundColor: '#10B981',
  },
  reloadButtonText: {
    color: '#020617',
    fontSize: 13,
    fontWeight: '700',
  },
});
