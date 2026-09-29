import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { Palette } from '@/constants/theme';
import { getFoodByBarcodeWithFallback, CachedFoodItem } from '@/services/foodCacheService';
import { analyzeBackOfPack, ScanAnalysisResult } from '@/services/scanService';
import { logMealDurable } from '@/services/mealService';
import { useOfflineSyncStore } from '@/stores/useOfflineSyncStore';
import { useAuthStore } from '@/stores/useAuthStore';

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [torch, setTorch] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [activeBarcode, setActiveBarcode] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<CachedFoodItem | ScanAnalysisResult | null>(null);
  const [showResultModal, setShowResultModal] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoggingMeal, setIsLoggingMeal] = useState<boolean>(false);

  const cameraRef = useRef<CameraView | null>(null);
  const isOnline = useOfflineSyncStore((s) => s.isOnline);
  const pendingCount = useOfflineSyncStore((s) => s.pendingCount);
  const userId = useAuthStore((s) => s.userId);

  // Non-blocking Barcode Scanned handler
  const handleBarcodeScanned = useCallback(
    async (scanningResult: BarcodeScanningResult) => {
      const barcode = scanningResult.data;
      if (!barcode || !isScanning || isAnalyzing) return;

      setIsScanning(false);
      setActiveBarcode(barcode);
      setStatusMessage(`Found barcode: ${barcode}. Looking up...`);

      try {
        const item = await getFoodByBarcodeWithFallback(barcode);
        if (item) {
          setScanResult(item);
          setShowResultModal(true);
          setStatusMessage(null);
        } else {
          setStatusMessage(`Uncatalogued item (${barcode}). Take a photo of the ingredients.`);
        }
      } catch (err) {
        console.warn('[ScanScreen] Barcode lookup error:', err);
        setStatusMessage('Lookup failed. Try capturing the back-of-pack.');
      }
    },
    [isScanning, isAnalyzing]
  );

  // Back-of-pack capture and compression (<= 1MB JPEG)
  const handleCaptureBackOfPack = async () => {
    if (!cameraRef.current || isAnalyzing) return;

    try {
      setIsAnalyzing(true);
      setStatusMessage('Capturing & compressing image...');

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: true,
      });

      if (!photo || !photo.uri) {
        throw new Error('Failed to capture photo');
      }

      // Compress and resize image to ensure size <= 1 MB
      const manipulated = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      setStatusMessage('Analyzing back-of-pack via AI OCR...');

      const analysis = await analyzeBackOfPack({
        imageUri: manipulated.uri,
        barcode: activeBarcode || undefined,
      });

      setScanResult(analysis);
      setShowResultModal(true);
      setStatusMessage(null);
    } catch (err) {
      console.error('[ScanScreen] Analysis failed:', err);
      setStatusMessage(err instanceof Error ? err.message : 'Analysis failed. Check connection.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Log scanned meal using durable offline queue
  const handleLogMeal = async () => {
    if (!scanResult || isLoggingMeal) return;

    const currentUserId = userId || 'anonymous_user';
    let mealName = 'Scanned Meal';
    if ('product_name' in scanResult && scanResult.product_name) {
      mealName = scanResult.product_name;
    } else if ('name' in scanResult && scanResult.name) {
      mealName = scanResult.name;
    }
    const calories = scanResult.calories || 0;
    const protein = scanResult.protein || 0;
    const carbs = scanResult.carbs || 0;
    const fat = scanResult.fat || 0;

    setIsLoggingMeal(true);
    try {
      await logMealDurable(
        {
          name: mealName,
          calories,
          protein,
          carbs,
          fat,
          ingredients: Array.isArray(scanResult.ingredients)
            ? scanResult.ingredients.map((i: unknown) => ({
                name: typeof i === 'string' ? i : (i as { name: string }).name || '',
              }))
            : [],
        },
        currentUserId
      );

      setShowResultModal(false);
      setScanResult(null);
      setActiveBarcode(null);
      setIsScanning(true);
      setStatusMessage('✓ Meal successfully saved to offline queue!');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('[ScanScreen] Error logging meal:', err);
      setStatusMessage('Failed to queue meal.');
    } finally {
      setIsLoggingMeal(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={Palette.emerald400} size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionSub}>
          Z-SeHealth needs camera access to scan barcodes and analyze back-of-pack food ingredients.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Telemetry & Status Pill */}
      <View style={styles.topBar}>
        <View style={[styles.statusPill, isOnline ? styles.onlinePill : styles.offlinePill]}>
          <View style={[styles.statusDot, isOnline ? styles.onlineDot : styles.offlineDot]} />
          <Text style={styles.statusText}>
            {isOnline ? 'Online' : 'Offline Mode'}
            {pendingCount > 0 ? ` (${pendingCount} queued)` : ''}
          </Text>
        </View>

        <View style={styles.topControls}>
          <TouchableOpacity
            style={[styles.iconButton, torch && styles.iconButtonActive]}
            onPress={() => setTorch((prev) => !prev)}
          >
            <Text style={styles.iconButtonText}>{torch ? '🔦 On' : '🔦 Off'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setFacing((prev) => (prev === 'back' ? 'front' : 'back'))}
          >
            <Text style={styles.iconButtonText}>🔄 Flip</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Camera View */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'],
        }}
        onBarcodeScanned={isScanning ? handleBarcodeScanned : undefined}
      />

      {/* Target Reticle Overlay */}
      <View style={styles.overlayContainer} pointerEvents="none">
        <View style={styles.reticle}>
          <View style={[styles.reticleCorner, styles.reticleTopLeft]} />
          <View style={[styles.reticleCorner, styles.reticleTopRight]} />
          <View style={[styles.reticleCorner, styles.reticleBottomLeft]} />
          <View style={[styles.reticleCorner, styles.reticleBottomRight]} />
        </View>
      </View>

      {/* Status Bar / Banner */}
      {statusMessage && (
        <View style={styles.messageBanner}>
          <Text style={styles.messageBannerText}>{statusMessage}</Text>
        </View>
      )}

      {/* Bottom Actions Footer */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => {
            setIsScanning(true);
            setActiveBarcode(null);
            setStatusMessage('Point camera at barcode or ingredient list');
          }}
        >
          <Text style={styles.secondaryButtonText}>Reset Scan</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.captureButton, isAnalyzing && styles.captureButtonDisabled]}
          onPress={handleCaptureBackOfPack}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? (
            <ActivityIndicator color={Palette.slate950} />
          ) : (
            <Text style={styles.captureButtonText}>📸 Capture Back of Pack</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Result Bottom Sheet Modal */}
      <Modal visible={showResultModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {('product_name' in (scanResult || {})
                    ? (scanResult as ScanAnalysisResult).product_name
                    : (scanResult as CachedFoodItem)?.name) || 'Scanned Food'}
                </Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => {
                    setShowResultModal(false);
                    setIsScanning(true);
                  }}
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Nutrition Overview */}
              <View style={styles.macroRow}>
                <View style={styles.macroCard}>
                  <Text style={styles.macroLabel}>CALORIES</Text>
                  <Text style={[styles.macroValue, { color: Palette.emerald400 }]}>
                    {scanResult?.calories ?? '--'} kcal
                  </Text>
                </View>
                <View style={styles.macroCard}>
                  <Text style={styles.macroLabel}>PROTEIN</Text>
                  <Text style={[styles.macroValue, { color: Palette.sky400 }]}>
                    {scanResult?.protein ?? '--'} g
                  </Text>
                </View>
                <View style={styles.macroCard}>
                  <Text style={styles.macroLabel}>CARBS</Text>
                  <Text style={[styles.macroValue, { color: Palette.amber400 }]}>
                    {scanResult?.carbs ?? '--'} g
                  </Text>
                </View>
                <View style={styles.macroCard}>
                  <Text style={styles.macroLabel}>FAT</Text>
                  <Text style={[styles.macroValue, { color: Palette.rose400 }]}>
                    {scanResult?.fat ?? '--'} g
                  </Text>
                </View>
              </View>

              {/* FSSAI Additives Safety */}
              {scanResult && 'additives' in scanResult && Array.isArray(scanResult.additives) && scanResult.additives.length > 0 && (
                <View style={styles.sectionContainer}>
                  <Text style={styles.sectionTitle}>Detected Additives (FSSAI Engine)</Text>
                  {scanResult.additives.map((additive, idx) => {
                    const status =
                      ('fssai_regulatory_status' in additive ? additive.fssai_regulatory_status : null) ||
                      additive.risk ||
                      'Permitted additive';
                    return (
                      <View key={idx} style={styles.additiveRow}>
                        <View style={styles.additiveBadge}>
                          <Text style={styles.additiveCode}>{additive.code || 'INS'}</Text>
                        </View>
                        <View style={styles.additiveInfo}>
                          <Text style={styles.additiveName}>{additive.name}</Text>
                          <Text style={styles.additiveStatus}>{status}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Action Buttons */}
              <TouchableOpacity
                style={[styles.primaryButton, isLoggingMeal && styles.captureButtonDisabled]}
                onPress={handleLogMeal}
                disabled={isLoggingMeal}
              >
                {isLoggingMeal ? (
                  <ActivityIndicator color={Palette.slate950} />
                ) : (
                  <Text style={styles.primaryButtonText}>✓ Log Meal (Durable Offline)</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.slate950,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: Palette.slate950,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionTitle: {
    color: Palette.slate100,
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionSub: {
    color: Palette.slate400,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  topBar: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
  },
  onlinePill: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderColor: Palette.slate800,
  },
  offlinePill: {
    backgroundColor: 'rgba(244, 63, 94, 0.15)',
    borderColor: Palette.rose400,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  onlineDot: {
    backgroundColor: Palette.emerald400,
  },
  offlineDot: {
    backgroundColor: Palette.rose400,
  },
  statusText: {
    color: Palette.slate100,
    fontSize: 12,
    fontWeight: '600',
  },
  topControls: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: Palette.slate800,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  iconButtonActive: {
    borderColor: Palette.emerald400,
  },
  iconButtonText: {
    color: Palette.slate100,
    fontSize: 12,
    fontWeight: 'bold',
  },
  overlayContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticle: {
    width: 260,
    height: 260,
    position: 'relative',
  },
  reticleCorner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: Palette.emerald400,
  },
  reticleTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  reticleTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  reticleBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  reticleBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  messageBanner: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderWidth: 1,
    borderColor: Palette.slate800,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
  },
  messageBannerText: {
    color: Palette.slate300,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    backgroundColor: Palette.slate900,
    borderWidth: 1,
    borderColor: Palette.slate800,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: Palette.slate300,
    fontSize: 14,
    fontWeight: 'bold',
  },
  captureButton: {
    flex: 1,
    backgroundColor: Palette.emerald400,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  captureButtonText: {
    color: Palette.slate950,
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Palette.slate900,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: Palette.slate800,
    padding: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: Palette.slate100,
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    color: Palette.slate400,
    fontSize: 20,
    fontWeight: 'bold',
  },
  macroRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  macroCard: {
    flex: 1,
    backgroundColor: Palette.slate950,
    borderWidth: 1,
    borderColor: Palette.slate800,
    borderRadius: 14,
    padding: 10,
    alignItems: 'center',
  },
  macroLabel: {
    color: Palette.slate500,
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 4,
  },
  macroValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  sectionContainer: {
    backgroundColor: Palette.slate950,
    borderWidth: 1,
    borderColor: Palette.slate800,
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
  },
  sectionTitle: {
    color: Palette.slate300,
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  additiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Palette.slate800,
  },
  additiveBadge: {
    backgroundColor: Palette.slate800,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 10,
  },
  additiveCode: {
    color: Palette.amber400,
    fontSize: 11,
    fontWeight: 'bold',
  },
  additiveInfo: {
    flex: 1,
  },
  additiveName: {
    color: Palette.slate100,
    fontSize: 13,
    fontWeight: '600',
  },
  additiveStatus: {
    color: Palette.slate400,
    fontSize: 11,
  },
  primaryButton: {
    backgroundColor: Palette.emerald400,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  primaryButtonText: {
    color: Palette.slate950,
    fontSize: 15,
    fontWeight: 'bold',
  },
});
