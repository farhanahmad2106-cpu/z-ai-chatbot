// MUST be the very first import — required for @react-navigation/drawer gesture support
import 'react-native-gesture-handler';

// --- DEBUG INJECT ---
if (typeof window !== 'undefined') {
  window.onerror = function(msg, url, line, col, error) {
    document.body.innerHTML = '<div style="color:red;padding:20px;font-family:monospace"><h3>Runtime Error:</h3>' + msg + '<br/><br/>' + (error && error.stack ? error.stack.replace(/\n/g, '<br/>') : '') + '</div>';
    return false;
  };
}
// --------------------

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
