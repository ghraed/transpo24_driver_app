import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/context/auth-context';

function AppNavigator() {
  const { isRestoringSession } = useAuth();

  if (isRestoringSession) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Driver Login' }} />
      <Stack.Screen name="register" options={{ title: 'Driver Registration' }} />
      <Stack.Screen name="complete-profile" options={{ title: 'Complete Profile' }} />
      <Stack.Screen name="vehicle-documents" options={{ title: 'Vehicle & Documents' }} />
      <Stack.Screen name="set-availability" options={{ title: 'Set Availability' }} />
      <Stack.Screen name="waiting-approval" options={{ title: 'Waiting Approval' }} />
      <Stack.Screen name="driver-home" options={{ title: 'Driver Home' }} />
      <Stack.Screen name="receive-requests" options={{ title: 'Available Requests' }} />
      <Stack.Screen name="review-request-details" options={{ title: 'Request Details' }} />
      <Stack.Screen name="send-price-offer" options={{ title: 'Send Price Offer' }} />
      <Stack.Screen name="explore" options={{ title: 'Explore' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
});
