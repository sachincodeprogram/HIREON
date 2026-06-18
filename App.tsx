import React from 'react';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import auth from '@react-native-firebase/auth';
import { store } from './src/store';
import RootNavigator from './src/navigation/RootNavigator';

if (__DEV__) {
  LogBox.ignoreAllLogs();
}

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <RootNavigator />
      </Provider>
    </SafeAreaProvider>
  );
}

export default App;
