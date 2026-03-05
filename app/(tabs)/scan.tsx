import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Dimensions,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getPadding, getFontSizes, scale } from '@/utils/responsive';
import { apiRequest } from '@/utils/backend';
import { useRouter } from 'expo-router';

const padding = getPadding();
const fontSizes = getFontSizes();
const { width, height } = Dimensions.get('window');

interface CarVerificationResult {
  ok: boolean;
  verified: boolean;
  car?: {
    _id: string;
    id: string;
    brand: string;
    model: string;
    year: number;
    status: string;
  };
  message: string;
}

export default function ScanScreen() {
  const [isScanning, setIsScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<CarVerificationResult | null>(null);
  const [scanned, setScanned] = useState(false);
  const router = useRouter();
  const verifyStartedAtRef = useRef<number | null>(null);
  const verifyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Reset scanned state when scanning starts
    if (isScanning) {
      setScanned(false);
      setVerificationResult(null);
    }
  }, [isScanning]);

  const clearVerifyTimeout = () => {
    if (verifyTimeoutRef.current) {
      clearTimeout(verifyTimeoutRef.current);
      verifyTimeoutRef.current = null;
    }
  };

  const finishVerifyingWithMinDelay = () => {
    const startedAt = verifyStartedAtRef.current;
    const elapsed = typeof startedAt === 'number' ? Date.now() - startedAt : 0;
    const remaining = Math.max(0, 5000 - elapsed);

    clearVerifyTimeout();
    verifyTimeoutRef.current = setTimeout(() => {
      setIsVerifying(false);
      verifyTimeoutRef.current = null;
    }, remaining);
  };

  const handleScan = async () => {
    if (!permission) {
      // Permission is still being requested
      return;
    }

    if (!permission.granted) {
      // Request permission
      const result = await requestPermission();
      if (!result.granted) {
    Alert.alert(
          'Permission requise',
          'L\'accès à la caméra est nécessaire pour scanner les codes QR.',
      [{ text: 'OK' }]
    );
        return;
      }
    }

    setIsScanning(true);
    setScanned(false);
    setVerificationResult(null);
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned || isVerifying) return;

    setScanned(true);
    setIsVerifying(true);
    verifyStartedAtRef.current = Date.now();
    clearVerifyTimeout();

    try {
      // Extract car ID from QR code URL
      // QR code format: ${baseUrl}/verify-car/${carId}
      let carId: string | null = null;

      // Try to extract car ID from URL
      const urlMatch = data.match(/\/verify-car\/([a-fA-F0-9]{24})/);
      if (urlMatch) {
        carId = urlMatch[1];
      } else {
        // If it's just the car ID directly
        const idMatch = data.match(/^[a-fA-F0-9]{24}$/);
        if (idMatch) {
          carId = idMatch[0];
        }
      }

      if (!carId) {
        throw new Error('Code QR invalide. Format attendu: URL avec ID de véhicule.');
      }

      // Verify car with backend
      const response = await apiRequest(`/car/verify/${carId}`, {
        method: 'GET',
      });

      const result: CarVerificationResult = await response.json();

      setVerificationResult(result);
      finishVerifyingWithMinDelay();
    } catch (error: any) {
      setVerificationResult({
        ok: false,
        verified: false,
        message: error?.message || 'Erreur lors de la vérification du véhicule',
      });
      finishVerifyingWithMinDelay();
    }
  };

  const handleViewCarDetails = () => {
    if (verificationResult?.car?.id) {
      setIsScanning(false);
      router.push(`/car/${verificationResult.car.id}`);
    }
  };

  const handleRescan = () => {
    clearVerifyTimeout();
    verifyStartedAtRef.current = null;
    setScanned(false);
    setVerificationResult(null);
    setIsVerifying(false);
  };

  const closeScanner = () => {
    clearVerifyTimeout();
    verifyStartedAtRef.current = null;
    setIsScanning(false);
    setScanned(false);
    setVerificationResult(null);
    setIsVerifying(false);
  };

  if (isScanning) {
    return (
      <View style={styles.scannerContainer}>
        <StatusBar style="light" />
        
        {/* Camera view - only show when not scanned */}
        {!scanned && (
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
          >
            {/* Overlay */}
            <View style={styles.overlay}>
              {/* Top bar with close button */}
              <SafeAreaView edges={['top']} style={styles.topBar}>
                <TouchableOpacity
                  onPress={closeScanner}
                  style={styles.closeButton}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['rgba(0, 0, 0, 0.6)', 'rgba(0, 0, 0, 0.4)']}
                    style={styles.closeButtonGradient}
                  >
                    <IconSymbol name="xmark" size={scale(24)} color="#ffffff" />
                  </LinearGradient>
                </TouchableOpacity>
              </SafeAreaView>

              {/* Scanning frame */}
              <View style={styles.scanningFrame}>
                {/* Overlay masks */}
                <View style={styles.overlayTop} />
                <View style={styles.overlayBottom} />
                <View style={styles.overlayLeft} />
                <View style={styles.overlayRight} />
                
                {/* Frame corners */}
                <View style={styles.frameCorner} />
                <View style={[styles.frameCorner, styles.frameCornerTopRight]} />
                <View style={[styles.frameCorner, styles.frameCornerBottomLeft]} />
                <View style={[styles.frameCorner, styles.frameCornerBottomRight]} />
              </View>

              {/* Bottom info */}
              <View style={styles.bottomInfo}>
                <ThemedText style={styles.scanningText}>
                  Positionnez le code QR dans le cadre
                </ThemedText>
              </View>
            </View>
          </CameraView>
        )}

        {/* Loading Modal */}
        {isVerifying && (
          <Modal
            visible={isVerifying}
            transparent={true}
            animationType="fade"
          >
            <View style={styles.modalContainer}>
              <LinearGradient
                colors={['rgba(13, 148, 136, 0.98)', 'rgba(20, 184, 166, 0.98)']}
                style={styles.modalGradient}
              >
                <ActivityIndicator size="large" color="#ffffff" />
                <ThemedText style={styles.modalTitle}>
                  Vérification en cours...
                </ThemedText>
                <ThemedText style={styles.modalSubtitle}>
                  Veuillez patienter pendant que nous vérifions le véhicule
                </ThemedText>
              </LinearGradient>
            </View>
          </Modal>
        )}

        {/* Result Modal */}
        {verificationResult && !isVerifying && (
          <Modal
            visible={true}
            transparent={true}
            animationType="fade"
          >
            <View style={styles.modalContainer}>
              <LinearGradient
                colors={
                  verificationResult.verified
                    ? ['rgba(34, 197, 94, 0.98)', 'rgba(22, 163, 74, 0.98)']
                    : ['rgba(239, 68, 68, 0.98)', 'rgba(220, 38, 38, 0.98)']
                }
                style={styles.resultModalGradient}
              >
                <IconSymbol
                  name={verificationResult.verified ? 'checkmark.seal.fill' : 'exclamationmark.triangle.fill'}
                  size={scale(80)}
                  color="#ffffff"
                />
                <ThemedText style={styles.resultModalTitle}>
                  {verificationResult.verified ? 'Véhicule vérifié' : 'Véhicule non vérifié'}
                </ThemedText>
                
                {verificationResult.car && (
                  <View style={styles.resultCarInfo}>
                    <ThemedText style={styles.resultCarInfoText}>
                      {verificationResult.car.brand} {verificationResult.car.model}
                    </ThemedText>
                    <ThemedText style={styles.resultCarInfoSubtext}>
                      Année: {verificationResult.car.year}
                    </ThemedText>
                  </View>
                )}
                
                <ThemedText style={styles.resultModalMessage}>
                  {verificationResult.message}
                </ThemedText>

                <View style={styles.resultModalActions}>
                  {verificationResult.verified && verificationResult.car && (
                    <TouchableOpacity
                      onPress={handleViewCarDetails}
                      style={styles.viewDetailsButton}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={['#ffffff', '#f0f0f0']}
                        style={styles.viewDetailsButtonGradient}
                      >
                        <IconSymbol name="car.fill" size={scale(20)} color="#0d9488" />
                        <ThemedText style={styles.viewDetailsButtonText}>
                          Voir les détails
                        </ThemedText>
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                  
                  <TouchableOpacity
                    onPress={handleRescan}
                    style={styles.rescanButton}
                    activeOpacity={0.8}
                  >
                    <ThemedText style={styles.rescanButtonText}>
                      Scanner à nouveau
                    </ThemedText>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    onPress={closeScanner}
                    style={styles.closeModalButton}
                    activeOpacity={0.8}
                  >
                    <ThemedText style={styles.closeModalButtonText}>
                      Fermer
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>
          </Modal>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View
          entering={FadeInDown.duration(600).springify()}
          style={styles.header}
        >
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
            style={styles.headerGradient}
          >
            <View style={styles.iconContainer}>
              <LinearGradient
                colors={['#0d9488', '#14b8a6']}
                style={styles.iconGradient}
              >
                <IconSymbol name="qrcode.viewfinder" size={scale(48)} color="#ffffff" />
              </LinearGradient>
            </View>
            <ThemedText style={styles.title}>Scanner QR Code</ThemedText>
            <ThemedText style={styles.subtitle}>
              Scannez le code QR d'un véhicule pour accéder à son rapport de vérification
            </ThemedText>
          </LinearGradient>
        </Animated.View>

        {/* Scan Button */}
        <View style={styles.content}>
          <TouchableOpacity
            onPress={handleScan}
            style={styles.scanButton}
            activeOpacity={0.8}
            disabled={!permission || (!permission.granted && permission.canAskAgain === false)}
          >
            <LinearGradient
              colors={['#0d9488', '#14b8a6']}
              style={styles.scanButtonGradient}
            >
              <IconSymbol name="qrcode.viewfinder" size={scale(32)} color="#ffffff" />
              <ThemedText style={styles.scanButtonText}>
                Lancer le scanner
              </ThemedText>
            </LinearGradient>
          </TouchableOpacity>

          {permission && !permission.granted && (
            <View style={styles.permissionWarning}>
              <IconSymbol name="exclamationmark.triangle.fill" size={scale(24)} color="#f59e0b" />
              <ThemedText style={styles.permissionWarningText}>
                L'accès à la caméra est requis pour scanner les codes QR.
              </ThemedText>
            </View>
          )}

          <View style={styles.infoContainer}>
            <IconSymbol name="info.circle.fill" size={scale(24)} color="#0d9488" />
            <ThemedText style={styles.infoText}>
              Utilisez le scanner pour vérifier l'authenticité d'un véhicule en scannant son code QR unique.
            </ThemedText>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: padding.large * 2,
  },
  header: {
    marginBottom: padding.large,
    borderRadius: scale(24),
    overflow: 'hidden',
    marginHorizontal: padding.horizontal,
    marginTop: padding.medium,
  },
  headerGradient: {
    padding: padding.large,
    alignItems: 'center',
  },
  iconContainer: {
    width: scale(100),
    height: scale(100),
    borderRadius: scale(50),
    overflow: 'hidden',
    marginBottom: padding.medium,
  },
  iconGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSizes['3xl'],
    fontWeight: '900',
    color: '#1f2937',
    marginBottom: padding.small,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSizes.md,
    color: '#64748b',
    textAlign: 'center',
  },
  content: {
    paddingHorizontal: padding.horizontal,
    gap: padding.large,
  },
  scanButton: {
    borderRadius: scale(16),
    overflow: 'hidden',
    marginTop: padding.medium,
  },
  scanButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: padding.medium,
    paddingVertical: padding.large,
    paddingHorizontal: padding.large,
  },
  scanButtonText: {
    fontSize: fontSizes.lg,
    fontWeight: '700',
    color: '#ffffff',
  },
  permissionWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: padding.medium,
    backgroundColor: '#fef3c7',
    padding: padding.medium,
    borderRadius: scale(12),
    borderWidth: scale(1),
    borderColor: '#fde68a',
  },
  permissionWarningText: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: '#92400e',
    lineHeight: fontSizes.sm * 1.5,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: padding.medium,
    backgroundColor: '#f0fdfa',
    padding: padding.medium,
    borderRadius: scale(12),
    borderWidth: scale(1),
    borderColor: '#ccfbf1',
  },
  infoText: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: '#0d9488',
    lineHeight: fontSizes.sm * 1.5,
  },
  // Scanner styles
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: padding.horizontal,
    paddingTop: padding.medium,
  },
  closeButton: {
    borderRadius: scale(24),
    overflow: 'hidden',
  },
  closeButtonGradient: {
    width: scale(48),
    height: scale(48),
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanningFrame: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  overlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '25%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  overlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '25%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  overlayLeft: {
    position: 'absolute',
    top: '25%',
    left: 0,
    width: '10%',
    height: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  overlayRight: {
    position: 'absolute',
    top: '25%',
    right: 0,
    width: '10%',
    height: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  frameCorner: {
    position: 'absolute',
    width: scale(60),
    height: scale(60),
    borderColor: '#0d9488',
    borderWidth: scale(4),
    top: '25%',
    left: '10%',
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  frameCornerTopRight: {
    left: 'auto',
    right: '10%',
    borderLeftWidth: 0,
    borderRightWidth: scale(4),
  },
  frameCornerBottomLeft: {
    top: 'auto',
    bottom: '25%',
    borderTopWidth: 0,
    borderBottomWidth: scale(4),
  },
  frameCornerBottomRight: {
    top: 'auto',
    bottom: '25%',
    left: 'auto',
    right: '10%',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderRightWidth: scale(4),
    borderBottomWidth: scale(4),
  },
  bottomInfo: {
    paddingBottom: padding.large * 2,
    alignItems: 'center',
    paddingHorizontal: padding.horizontal,
  },
  scanningText: {
    fontSize: fontSizes.lg,
    color: '#ffffff',
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: padding.medium,
    paddingHorizontal: padding.large,
    borderRadius: scale(12),
  },
  verificationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verificationGradient: {
    padding: padding.large * 2,
    borderRadius: scale(20),
    alignItems: 'center',
    gap: padding.large,
    minWidth: scale(250),
  },
  verificationText: {
    fontSize: fontSizes.lg,
    color: '#ffffff',
    fontWeight: '700',
  },
  resultOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultGradient: {
    padding: padding.large * 2,
    borderRadius: scale(20),
    alignItems: 'center',
    gap: padding.medium,
    minWidth: scale(300),
    marginHorizontal: padding.horizontal,
  },
  resultTitle: {
    fontSize: fontSizes['2xl'],
    color: '#ffffff',
    fontWeight: '800',
    textAlign: 'center',
  },
  carInfo: {
    alignItems: 'center',
    gap: scale(4),
    marginVertical: padding.small,
  },
  carInfoText: {
    fontSize: fontSizes.lg,
    color: '#ffffff',
    fontWeight: '600',
  },
  resultMessage: {
    fontSize: fontSizes.md,
    color: '#ffffff',
    textAlign: 'center',
    opacity: 0.9,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: padding.horizontal,
  },
  modalGradient: {
    width: '100%',
    maxWidth: scale(350),
    padding: padding.large * 2,
    borderRadius: scale(24),
    alignItems: 'center',
    gap: padding.large,
  },
  modalTitle: {
    fontSize: fontSizes['2xl'],
    color: '#ffffff',
    fontWeight: '800',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: fontSizes.md,
    color: '#ffffff',
    textAlign: 'center',
    opacity: 0.9,
  },
  resultModalGradient: {
    width: '100%',
    maxWidth: scale(350),
    padding: padding.large * 2,
    borderRadius: scale(24),
    alignItems: 'center',
    gap: padding.medium,
  },
  resultModalTitle: {
    fontSize: fontSizes['2xl'],
    color: '#ffffff',
    fontWeight: '800',
    textAlign: 'center',
  },
  resultCarInfo: {
    alignItems: 'center',
    gap: scale(4),
    marginVertical: padding.small,
    paddingVertical: padding.medium,
    paddingHorizontal: padding.large,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: scale(12),
    width: '100%',
  },
  resultCarInfoText: {
    fontSize: fontSizes.xl,
    color: '#ffffff',
    fontWeight: '700',
  },
  resultCarInfoSubtext: {
    fontSize: fontSizes.md,
    color: '#ffffff',
    opacity: 0.9,
  },
  resultModalMessage: {
    fontSize: fontSizes.md,
    color: '#ffffff',
    textAlign: 'center',
    opacity: 0.9,
    marginBottom: padding.small,
  },
  resultModalActions: {
    width: '100%',
    gap: padding.medium,
    marginTop: padding.medium,
  },
  viewDetailsButton: {
    borderRadius: scale(12),
    overflow: 'hidden',
  },
  viewDetailsButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: padding.small,
    paddingVertical: padding.medium,
    paddingHorizontal: padding.large,
  },
  viewDetailsButtonText: {
    fontSize: fontSizes.lg,
    fontWeight: '700',
    color: '#0d9488',
  },
  rescanButton: {
    paddingVertical: padding.medium,
    paddingHorizontal: padding.large,
    borderRadius: scale(12),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
  },
  rescanButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: '#ffffff',
  },
  closeModalButton: {
    paddingVertical: padding.small,
    alignItems: 'center',
  },
  closeModalButtonText: {
    fontSize: fontSizes.sm,
    fontWeight: '500',
    color: '#ffffff',
    opacity: 0.8,
  },
});
