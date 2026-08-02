import React from 'react';
import { DarkTheme as NavigationDarkTheme, DefaultTheme as NavigationDefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { logUserAction } from '../utils/logger';

// Screens
import OnboardingScreen from '../screens/OnboardingScreen';
import DashboardScreen from '../screens/DashboardScreen';
import LogDriveScreen from '../screens/LogDriveScreen';
import DriveHistoryScreen from '../screens/DriveHistoryScreen';
import ExportScreen from '../screens/ExportScreen';
import SettingsHomeScreen from '../screens/SettingsHomeScreen';
import GoalSettingsScreen from '../screens/GoalSettingsScreen';
import AppearanceSettingsScreen from '../screens/AppearanceSettingsScreen';
import SupervisorProfilesScreen from '../screens/SupervisorProfilesScreen';
import DriverProfileSettingsScreen from '../screens/DriverProfileSettingsScreen';
import DriveTrackingSettingsScreen from '../screens/DriveTrackingSettingsScreen';
import DataSettingsScreen from '../screens/DataSettingsScreen';
import AboutSettingsScreen from '../screens/AboutSettingsScreen';
import DiagnosticsSettingsScreen from '../screens/DiagnosticsSettingsScreen';
import WeatherSettingsScreen from '../screens/WeatherSettingsScreen';

// Context
import { useDriving } from '../contexts/DrivingContext';
import { useTheme } from '../contexts/ThemeContext';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Tab icon component
function TabIcon({ children, focused, theme }) {
  return (
    <View style={{
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 28,
    }}>
      <Icon name={children} size={21} color={focused ? theme.colors.primary : theme.colors.text.light} />
    </View>
  );
}

// Main tab navigator
function MainTabs() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarBottomInset = Math.max(insets.bottom, 8);
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => {
          let iconName;
          
          switch (route.name) {
            case 'Dashboard':
              iconName = 'home-variant-outline';
              break;
            case 'LogDrive':
              iconName = 'car-clock';
              break;
            case 'DriveHistory':
              iconName = 'notebook-outline';
              break;
            case 'Settings':
              iconName = 'cog-outline';
              break;
            default:
              iconName = 'circle-small';
          }
          
          return <TabIcon focused={focused} theme={theme}>{iconName}</TabIcon>;
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.text.light,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border.light,
          borderTopWidth: 1,
          paddingBottom: tabBarBottomInset,
          paddingTop: 7,
          height: 56 + tabBarBottomInset,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 0,
        },
        headerStyle: {
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.border.light,
          borderBottomWidth: 1,
          elevation: 0,
        },
        headerTitleStyle: {
          fontFamily: theme.typography.families.display,
          fontSize: 21,
          fontWeight: '700',
          color: theme.colors.text.primary,
          letterSpacing: -0.3,
        },
        headerTintColor: theme.colors.primary,
      })}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          headerShown: false,
        }}
      />
      <Tab.Screen 
        name="LogDrive" 
        component={LogDriveScreen}
        options={{
          title: 'Log Drive',
          tabBarLabel: 'Log Drive',
          headerShown: false,
        }}
      />
      <Tab.Screen 
        name="DriveHistory" 
        component={DriveHistoryScreen}
        options={{
          title: 'Logbook',
          tabBarLabel: 'Logbook',
          headerShown: false,
        }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsHomeScreen}
        options={{
          title: 'Settings',
          headerShown: false,
        }}
      />
    </Tab.Navigator>
  );
}

// Main app navigator
function AppNavigator() {
  const { user, loading } = useDriving();
  const { theme, isDark } = useTheme();
  const navigationTheme = React.useMemo(() => {
    const baseTheme = isDark ? NavigationDarkTheme : NavigationDefaultTheme;

    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        primary: theme.colors.primary,
        background: theme.colors.background,
        card: theme.colors.surface,
        text: theme.colors.text.primary,
        border: theme.colors.border.light,
        notification: theme.colors.error,
      },
    };
  }, [isDark, theme]);

  if (loading) {
    // You could show a loading screen here
    return null;
  }

  // Navigation state change handler for logging
  const handleNavigationStateChange = (state) => {
    if (state) {
      const currentRoute = getCurrentRouteName(state);
      if (currentRoute) {
        logUserAction('navigation', currentRoute);
      }
    }
  };

  return (
    <NavigationContainer theme={navigationTheme} onStateChange={handleNavigationStateChange}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border.light,
            borderBottomWidth: 1,
          },
          headerTitleStyle: {
            fontFamily: theme.typography.families.display,
            fontSize: 18,
            fontWeight: '700',
            color: theme.colors.text.primary,
          },
          headerTintColor: theme.colors.primary,
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        {!user.onboardingComplete ? (
          <Stack.Screen 
            name="Onboarding" 
            component={OnboardingScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <Stack.Screen 
              name="Main" 
              component={MainTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen 
              name="Export" 
              component={ExportScreen}
              options={{ 
                title: 'Export & Share',
                presentation: 'modal',
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="Goals"
              component={GoalSettingsScreen}
              options={{ title: 'Driving goal', headerShown: false }}
            />
            <Stack.Screen
              name="Appearance"
              component={AppearanceSettingsScreen}
              options={{ title: 'Appearance', headerShown: false }}
            />
            <Stack.Screen
              name="Supervisors"
              component={SupervisorProfilesScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen name="DriverProfile" component={DriverProfileSettingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="DriveTracking" component={DriveTrackingSettingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="DataSettings" component={DataSettingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AboutSettings" component={AboutSettingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Diagnostics" component={DiagnosticsSettingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="WeatherSettings" component={WeatherSettingsScreen} options={{ headerShown: false }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// Helper function to get the current route name
function getCurrentRouteName(state) {
  const route = state.routes[state.index];
  
  if (route.state) {
    // Recursive call for nested navigators
    return getCurrentRouteName(route.state);
  }
  
  return route.name;
}

export default AppNavigator;
