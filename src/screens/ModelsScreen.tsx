import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { useModelStore } from '../stores/useModelStore';
import { Badge } from '../components/shared/Badge';

export const ModelsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { models, isLoading, error, fetchModels, loadModel, unloadModel, setDefaultModel } = useModelStore();

  useEffect(() => {
    fetchModels();
  }, []);

  const handleLoad = async (id: string, name: string) => {
    try {
      Alert.alert('Loading Model', `Activating ${name} inside system memory context...`, [], { cancelable: false });
      await loadModel(id);
      Alert.alert('Success', `${name} loaded successfully inside RAM.`);
    } catch (e: any) {
      Alert.alert('Failed to Load', e.message || 'Model load context failed.');
    }
  };

  const handleUnload = async (id: string, name: string) => {
    try {
      await unloadModel(id);
      Alert.alert('Success', `${name} unloaded successfully from RAM.`);
    } catch (e: any) {
      Alert.alert('Failed to Unload', e.message || 'Model unload context failed.');
    }
  };

  const handleSetDefault = async (id: string, name: string) => {
    try {
      await setDefaultModel(id);
      Alert.alert('Success', `${name} is now your default offline model.`);
    } catch (e: any) {
      Alert.alert('Failed to Set Default', e.message || 'Action failed.');
    }
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
        <Text style={styles.title}>MODEL MANAGER</Text>
        <TouchableOpacity style={styles.syncBtn} onPress={() => fetchModels()}>
          <Text style={styles.syncBtnText}>REFRESH</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Operations Failed</Text>
          <Text style={styles.errorSub}>{error}</Text>
        </View>
      ) : isLoading && models.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Fetching available local GGUF models...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <Text style={styles.subtitle}>SEED COLLECTION</Text>
          {models.length === 0 ? (
            <Text style={styles.emptyText}>No models configured in database.</Text>
          ) : (
            models.map((model) => {
              const isDownloaded = model.installed_at !== null;
              return (
                <View key={model.id} style={styles.card}>
                  {/* Card Title Header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.titleContainer}>
                      <Text style={styles.modelName}>{model.name}</Text>
                      {model.is_default && (
                        <View style={styles.defaultBadge}>
                          <Text style={styles.defaultText}>DEFAULT</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.badgeRow}>
                      <Badge label={model.quantization} variant="primary" />
                      {model.is_loaded ? (
                        <Badge label="IN RAM" variant="success" />
                      ) : isDownloaded ? (
                        <Badge label="OFFLINE" variant="warning" />
                      ) : (
                        <Badge label="UNINSTALLED" variant="error" />
                      )}
                    </View>
                  </View>

                  {/* Model Specs */}
                  <View style={styles.specGrid}>
                    <View style={styles.specCol}>
                      <Text style={styles.specLabel}>Family:</Text>
                      <Text style={styles.specVal}>{model.family.toUpperCase()}</Text>
                    </View>
                    <View style={styles.specCol}>
                      <Text style={styles.specLabel}>Params:</Text>
                      <Text style={styles.specVal}>{model.parameter_count}</Text>
                    </View>
                    <View style={styles.specCol}>
                      <Text style={styles.specLabel}>File Size:</Text>
                      <Text style={styles.specVal}>{(model.size_bytes / (1024 * 1024 * 1024)).toFixed(2)} GB</Text>
                    </View>
                    <View style={styles.specCol}>
                      <Text style={styles.specLabel}>Min RAM:</Text>
                      <Text style={styles.specVal}>{(model.ram_required_mb / 1024).toFixed(1)} GB</Text>
                    </View>
                  </View>

                  <Text style={styles.description}>{model.description}</Text>

                  {/* Actions Bar */}
                  <View style={styles.actionsRow}>
                    {isDownloaded ? (
                      <>
                        {model.is_loaded ? (
                          <TouchableOpacity
                            style={[styles.btn, styles.btnError]}
                            onPress={() => handleUnload(model.id, model.name)}
                          >
                            <Text style={styles.btnText}>UNLOAD FROM RAM</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={[styles.btn, styles.btnSuccess]}
                            onPress={() => handleLoad(model.id, model.name)}
                          >
                            <Text style={styles.btnText}>LOAD INTO RAM</Text>
                          </TouchableOpacity>
                        )}
                        {!model.is_default && (
                          <TouchableOpacity
                            style={[styles.btn, styles.btnSecondary]}
                            onPress={() => handleSetDefault(model.id, model.name)}
                          >
                            <Text style={styles.btnTextSecondary}>SET AS DEFAULT</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    ) : (
                      <View style={styles.installerBanner}>
                        <Text style={styles.installerText}>
                          Place the model file inside GGUF format `data/models/{model.filename}` to unlock.
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
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
  center: {
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
  errorText: {
    color: theme.colors.error,
    fontWeight: 'bold',
    fontSize: 16,
  },
  errorSub: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.gutter,
    gap: 16,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: theme.colors.onSurfaceVariant,
    letterSpacing: 1,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13.5,
    color: theme.colors.onSurfaceVariant,
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.outline,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  modelName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
  },
  defaultBadge: {
    backgroundColor: 'rgba(79, 70, 229, 0.1)',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  defaultText: {
    color: theme.colors.primary,
    fontSize: 8.5,
    fontWeight: 'bold',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  specGrid: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.colors.outline,
    backgroundColor: theme.colors.background,
    padding: 8,
    marginBottom: 12,
  },
  specCol: {
    flex: 1,
    alignItems: 'center',
  },
  specLabel: {
    fontSize: 10,
    color: theme.colors.onSurfaceVariant,
    marginBottom: 2,
  },
  specVal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
  },
  description: {
    fontSize: 12.5,
    color: theme.colors.onSurfaceVariant,
    lineHeight: 18,
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSuccess: {
    backgroundColor: theme.colors.secondary,
  },
  btnError: {
    backgroundColor: theme.colors.error,
  },
  btnSecondary: {
    borderWidth: 1.5,
    borderColor: theme.colors.outline,
    backgroundColor: 'transparent',
  },
  btnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  btnTextSecondary: {
    color: theme.colors.onSurface,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  installerBanner: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    padding: 10,
    width: '100%',
  },
  installerText: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 17,
  }
});

export default ModelsScreen;
