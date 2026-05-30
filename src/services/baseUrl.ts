import { Platform } from 'react-native';

/**
 * Returns the correct FastAPI backend base URL for the current environment.
 *
 * - Android Emulator: 10.0.2.2 maps to host machine's localhost
 * - All other (iOS sim, physical device, desktop): 127.0.0.1
 *
 * Port 8765 matches the FastAPI `config.py` default PORT setting.
 */
export const getBaseUrl = (): string => {
  if (__DEV__ && Platform.OS === 'android') {
    // Android emulator routes to host machine via 10.0.2.2
    return 'http://10.0.2.2:8765';
  }
  return 'http://127.0.0.1:8765';
};
