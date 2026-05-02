import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ScrollView,
  TextInput,
} from 'react-native';
import * as Location from 'expo-location';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme } from '../contexts/ThemeContext';

const LICENSE_TYPES = [
  {
    id: 'learners',
    title: "Learner's Permit",
    description: 'Just getting started with supervised driving',
    icon: '📖',
  },
  {
    id: 'restricted',
    title: 'Restricted License',
    description: 'Can drive independently with some restrictions',
    icon: '🚗',
  },
  {
    id: 'unrestricted',
    title: 'Unrestricted License',
    description: 'Full driving privileges',
    icon: '🏆',
  },
];

const GOAL_PRESETS = [
  {
    id: 'basic',
    title: '25 Hours',
    subtitle: 'No night hours required',
    dayHours: 25,
    nightHours: 0,
    description: 'Basic requirement for some states',
  },
  {
    id: 'standard',
    title: '50 Hours',
    subtitle: '10 hours at night',
    dayHours: 40,
    nightHours: 10,
    description: 'Most common requirement',
  },
  {
    id: 'comprehensive',
    title: '60 Hours',
    subtitle: '10 hours at night',
    dayHours: 50,
    nightHours: 10,
    description: 'Comprehensive training',
  },
];

export default function OnboardingScreen({ navigation }) {
  const { setUserInfo, completeOnboarding, updateSettings } = useDriving();
  const { theme } = useTheme();
  const [step, setStep] = useState(1);
  const [licenseType, setLicenseType] = useState(null);
  const [customGoal, setCustomGoal] = useState(false);
  const [dayHours, setDayHours] = useState('40');
  const [nightHours, setNightHours] = useState('10');
  const [temperatureUnit, setTemperatureUnit] = useState('metric');
  const [hasAgreed, setHasAgreed] = useState(false);

  const parseGoalValues = () => {
    const parsedDay = parseFloat(dayHours);
    const parsedNight = parseFloat(nightHours);
    return {
      day: Number.isFinite(parsedDay) ? parsedDay : 0,
      night: Number.isFinite(parsedNight) ? parsedNight : 0,
    };
  };

  const areGoalsValid = () => {
    const { day, night } = parseGoalValues();
    return day >= 0 && night >= 0 && day + night > 0;
  };

  const validateGoals = () => {
    const { day, night } = parseGoalValues();

    if (day < 0 || night < 0) {
      Alert.alert('Invalid Hours', 'Goal hours cannot be negative.');
      return false;
    }

    if (day + night === 0) {
      Alert.alert('Invalid Goal', 'Please enter at least 1 hour for day or night driving.');
      return false;
    }

    return true;
  };

  const handleLicenseSelection = (type) => {
    setLicenseType(type);
    if (type === 'unrestricted') {
      Alert.alert(
        'Notice',
        'You probably don\'t need this app with an unrestricted license, but you can still use it with a custom goal.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleGoalSelection = (preset) => {
    if (preset.id === 'custom') {
      setCustomGoal(true);
    } else {
      setCustomGoal(false);
      setDayHours(String(preset.dayHours));
      setNightHours(String(preset.nightHours));
    }
  };

  const handleGoalContinue = () => {
    if (customGoal && !validateGoals()) {
      return;
    }
    setStep(3);
  };

  const handleComplete = async () => {
    if (!hasAgreed) {
      Alert.alert('Agreement Required', 'Please agree to the data storage terms to continue.');
      return;
    }

    if (!validateGoals()) {
      return;
    }

    const { day: parsedDayHours, night: parsedNightHours } = parseGoalValues();

    // Request location permission for weather data
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission',
          'Location access is optional but helps us provide accurate weather data for your drive logs. You can still use the app without it.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.log('Location permission error:', error);
    }

    const userInfo = {
      licenseType,
      licenseDate: new Date().toISOString().split('T')[0],
      goalDayHours: parsedDayHours,
      goalNightHours: parsedNightHours,
      completedDayHours: 0,
      completedNightHours: 0,
    };

    setUserInfo(userInfo);
    
    // Set temperature unit preference
    updateSettings({ temperatureUnit });
    
    completeOnboarding();
    // Navigation will happen automatically when onboardingComplete becomes true
  };

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.colors.text.primary }]}>What's your current license type?</Text>
      <Text style={[styles.stepSubtitle, { color: theme.colors.text.secondary }]}>
        This helps us set appropriate goals and features for your situation.
      </Text>

      <View style={styles.optionsContainer}>
        {LICENSE_TYPES.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={[
              styles.optionCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light },
              licenseType === type.id && [styles.selectedOption, { 
                borderColor: theme.colors.primary, 
                backgroundColor: theme.colors.primary + '10' 
              }],
            ]}
            onPress={() => handleLicenseSelection(type.id)}
          >
            <Text style={styles.optionIcon}>{type.icon}</Text>
            <Text style={[styles.optionTitle, { color: theme.colors.text.primary }]}>{type.title}</Text>
            <Text style={[styles.optionDescription, { color: theme.colors.text.secondary }]}>{type.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[
          styles.continueButton, 
          { backgroundColor: theme.colors.primary },
          !licenseType && [styles.disabledButton, { backgroundColor: theme.colors.gray[400] }]
        ]}
        onPress={() => setStep(2)}
        disabled={!licenseType}
      >
        <Text style={[styles.continueButtonText, { color: theme.colors.text.inverse }]}>Continue</Text>
      </TouchableOpacity>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.colors.text.primary }]}>Set your driving goals</Text>
      <Text style={[styles.stepSubtitle, { color: theme.colors.text.secondary }]}>
        Choose a preset based on your state's requirements, or set a custom goal.
      </Text>

      <View style={styles.optionsContainer}>
        {GOAL_PRESETS.map((preset) => (
          <TouchableOpacity
            key={preset.id}
            style={[
              styles.goalCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light },
              !customGoal && Number(dayHours) === preset.dayHours && Number(nightHours) === preset.nightHours && [
                styles.selectedOption, 
                { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '10' }
              ],
            ]}
            onPress={() => handleGoalSelection(preset)}
          >
            <Text style={[styles.goalTitle, { color: theme.colors.text.primary }]}>{preset.title}</Text>
            <Text style={[styles.goalSubtitle, { color: theme.colors.primary }]}>{preset.subtitle}</Text>
            <Text style={[styles.goalDescription, { color: theme.colors.text.secondary }]}>{preset.description}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[
            styles.goalCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light },
            customGoal && [styles.selectedOption, { 
              borderColor: theme.colors.primary, 
              backgroundColor: theme.colors.primary + '10' 
            }]
          ]}
          onPress={() => setCustomGoal(true)}
        >
          <Text style={[styles.goalTitle, { color: theme.colors.text.primary }]}>Custom Goal</Text>
          <Text style={[styles.goalSubtitle, { color: theme.colors.primary }]}>Set your own hours</Text>
          <Text style={[styles.goalDescription, { color: theme.colors.text.secondary }]}>Perfect for specific requirements</Text>
        </TouchableOpacity>
      </View>

      {customGoal && (
        <View style={styles.customGoalContainer}>
          <View style={styles.goalInputRow}>
            <View style={styles.goalInputBlock}>
              <Text style={[styles.inputLabel, { color: theme.colors.text.primary }]}>Day Driving Hours</Text>
              <TextInput
                style={[
                  styles.goalInput,
                  { 
                    backgroundColor: theme.colors.surface, 
                    borderColor: theme.colors.border.light,
                    color: theme.colors.text.primary,
                  }
                ]}
                value={dayHours}
                onChangeText={(value) => setDayHours(value.replace(/[^0-9.]/g, ''))}
                keyboardType="numeric"
                placeholder="e.g. 40"
                placeholderTextColor={theme.colors.text.light}
              />
            </View>
            <View style={styles.goalInputBlock}>
              <Text style={[styles.inputLabel, { color: theme.colors.text.primary }]}>Night Driving Hours</Text>
              <TextInput
                style={[
                  styles.goalInput,
                  { 
                    backgroundColor: theme.colors.surface, 
                    borderColor: theme.colors.border.light,
                    color: theme.colors.text.primary,
                  }
                ]}
                value={nightHours}
                onChangeText={(value) => setNightHours(value.replace(/[^0-9.]/g, ''))}
                keyboardType="numeric"
                placeholder="e.g. 10"
                placeholderTextColor={theme.colors.text.light}
              />
            </View>
          </View>
          <Text style={[styles.customGoalHint, { color: theme.colors.text.secondary }]}>
            Total goal: {(parseGoalValues().day + parseGoalValues().night) || 0} hours. Adjust both fields to match your local requirements.
          </Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.backButton, { borderColor: theme.colors.border.medium }]}
          onPress={() => setStep(1)}
        >
          <Text style={[styles.backButtonText, { color: theme.colors.text.secondary }]}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.continueButton, 
            { backgroundColor: theme.colors.primary },
            customGoal && !areGoalsValid() && [styles.disabledButton, { backgroundColor: theme.colors.gray[400] }]
          ]}
          onPress={handleGoalContinue}
          disabled={customGoal && !areGoalsValid()}
        >
          <Text style={[styles.continueButtonText, { color: theme.colors.text.inverse }]}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.colors.text.primary }]}>Temperature Preference</Text>
      <Text style={[styles.stepSubtitle, { color: theme.colors.text.secondary }]}>
        Choose how you'd like to see temperature in weather data.
      </Text>

      <View style={styles.optionsContainer}>
        <TouchableOpacity
          style={[
            styles.optionCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light },
            temperatureUnit === 'metric' && [styles.selectedOption, { 
              borderColor: theme.colors.primary, 
              backgroundColor: theme.colors.primary + '10' 
            }],
          ]}
          onPress={() => setTemperatureUnit('metric')}
        >
          <Text style={styles.optionIcon}>🌡️</Text>
          <View style={styles.optionContent}>
            <Text style={[styles.optionTitle, { color: theme.colors.text.primary }]}>Celsius</Text>
            <Text style={[styles.optionDescription, { color: theme.colors.text.secondary }]}>
              Example: 20°C
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.optionCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light },
            temperatureUnit === 'imperial' && [styles.selectedOption, { 
              borderColor: theme.colors.primary, 
              backgroundColor: theme.colors.primary + '10' 
            }],
          ]}
          onPress={() => setTemperatureUnit('imperial')}
        >
          <Text style={styles.optionIcon}>🌡️</Text>
          <View style={styles.optionContent}>
            <Text style={[styles.optionTitle, { color: theme.colors.text.primary }]}>Fahrenheit</Text>
            <Text style={[styles.optionDescription, { color: theme.colors.text.secondary }]}>
              Example: 68°F
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.backButton, { borderColor: theme.colors.border.medium }]}
          onPress={() => setStep(2)}
        >
          <Text style={[styles.backButtonText, { color: theme.colors.text.secondary }]}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: theme.colors.primary }]}
          onPress={() => setStep(4)}
        >
          <Text style={[styles.nextButtonText, { color: theme.colors.text.inverse }]}>Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.colors.text.primary }]}>Important Notice</Text>
      
      <View style={[styles.noticeContainer, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.noticeText, { color: theme.colors.text.primary }]}>
          <Text style={[styles.boldText, { color: theme.colors.text.primary }]}>Data Storage:</Text> This app stores all your driving log data locally on your device. 
          Your data is never sent to the cloud or shared with third parties.
        </Text>
        
        <Text style={[styles.noticeText, { color: theme.colors.text.primary }]}>
          <Text style={[styles.boldText, { color: theme.colors.text.primary }]}>Location & Weather:</Text> Your location coordinates WILL be sent to our server 
          to fetch weather data for your drives. However, this location data is never stored and is instantly deleted from server records.
        </Text>
        
        <Text style={[styles.noticeText, { color: theme.colors.text.primary }]}>
          <Text style={[styles.boldText, { color: theme.colors.text.primary }]}>Data Loss Warning:</Text> Uninstalling the app will permanently delete your driving log 
          unless you export and backup your data first.
        </Text>
        
        <Text style={[styles.noticeText, { color: theme.colors.text.primary }]}>
          <Text style={[styles.boldText, { color: theme.colors.text.primary }]}>Recommendation:</Text> Regularly export your data to prevent loss. 
          We'll remind you to backup your progress.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.checkboxContainer, { backgroundColor: theme.colors.surface }]}
        onPress={() => setHasAgreed(!hasAgreed)}
      >
        <View style={[
          styles.checkbox, 
          { borderColor: theme.colors.border.medium, backgroundColor: theme.colors.surface },
          hasAgreed && [styles.checkedBox, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]
        ]}>
          {hasAgreed && <Text style={[styles.checkmark, { color: theme.colors.text.inverse }]}>✓</Text>}
        </View>
        <Text style={[styles.checkboxText, { color: theme.colors.text.primary }]}>
          I understand and agree to these terms
        </Text>
      </TouchableOpacity>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.backButton, { borderColor: theme.colors.border.medium }]}
          onPress={() => setStep(3)}
        >
          <Text style={[styles.backButtonText, { color: theme.colors.text.secondary }]}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.continueButton, 
            { backgroundColor: theme.colors.primary },
            !hasAgreed && [styles.disabledButton, { backgroundColor: theme.colors.gray[400] }]
          ]}
          onPress={handleComplete}
          disabled={!hasAgreed}
        >
          <Text style={[styles.continueButtonText, { color: theme.colors.text.inverse }]}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.logo, { color: theme.colors.primary }]}>🛣️ Drively</Text>
          <Text style={[styles.subtitle, { color: theme.colors.text.secondary }]}>Your driving companion</Text>
          
          <View style={styles.progressContainer}>
            {[1, 2, 3, 4].map((num) => (
              <View
                key={num}
                style={[
                  styles.progressDot,
                  { backgroundColor: theme.colors.border.light },
                  step >= num && [styles.activeDot, { backgroundColor: theme.colors.primary }],
                ]}
              />
            ))}
          </View>
        </View>

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
    paddingTop: 20,
  },
  logo: {
    fontSize: 36,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 40,
    fontWeight: '500',
  },
  progressContainer: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  activeDot: {
    transform: [{ scale: 1.2 }],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  stepContainer: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  stepSubtitle: {
    fontSize: 17,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  optionsContainer: {
    gap: 20,
    marginBottom: 32,
  },
  optionCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  selectedOption: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  optionIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  optionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 6,
  },
  optionDescription: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  goalCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  goalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 6,
  },
  goalSubtitle: {
    fontSize: 15,
    marginBottom: 6,
    fontWeight: '500',
  },
  goalDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  customGoalContainer: {
    marginTop: 8,
    marginBottom: 20,
    gap: 12,
  },
  goalInputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  goalInputBlock: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  goalInput: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  customGoalHint: {
    fontSize: 14,
    lineHeight: 20,
  },
  noticeContainer: {
    padding: 24,
    borderRadius: 16,
    marginBottom: 32,
    gap: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  noticeText: {
    fontSize: 15,
    lineHeight: 22,
  },
  boldText: {
    fontWeight: '600',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    marginRight: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkedBox: {
    // Applied dynamically with theme colors
  },
  checkmark: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  continueButton: {
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    flex: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  disabledButton: {
    shadowOpacity: 0.2,
  },
  continueButtonText: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  backButton: {
    backgroundColor: 'transparent',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    flex: 1,
  },
  backButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  nextButton: {
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    flex: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  nextButtonText: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
