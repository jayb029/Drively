import React, { useEffect, useRef, useState } from 'react';
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
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme } from '../contexts/ThemeContext';
import { requestNotificationPermission, requestStoragePermission } from '../utils/permissions';
import {
  formatDateOfBirthFromDate,
  getDateOfBirthDate,
  getMinimumDateOfBirthDate,
} from '../utils/time';

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
    dayHours: 50,
    nightHours: 10,
    description: 'Most common requirement',
  },
  {
    id: 'comprehensive',
    title: '60 Hours',
    subtitle: '10 hours at night',
    dayHours: 60,
    nightHours: 10,
    description: 'Comprehensive training',
  },
];

const TEMPERATURE_OPTIONS = [
  {
    id: 'metric',
    title: 'Celsius',
    description: 'Weather in °C',
  },
  {
    id: 'imperial',
    title: 'Fahrenheit',
    description: 'Weather in °F',
  },
];

const DISTANCE_OPTIONS = [
  {
    id: 'metric',
    title: 'Kilometers',
    description: 'Distances in km and speeds in km/h',
  },
  {
    id: 'imperial',
    title: 'Miles',
    description: 'Distances in mi and speeds in mph',
  },
];

export default function OnboardingScreen({ navigation }) {
  const { completeOnboarding, updateSettings } = useDriving();
  const { theme, isDark } = useTheme();
  const scrollViewRef = useRef(null);
  const [step, setStep] = useState(1);
  const [licenseType, setLicenseType] = useState(null);
  const [customGoal, setCustomGoal] = useState(false);
  const [dayHours, setDayHours] = useState('50');
  const [nightHours, setNightHours] = useState('10');
  const [driverName, setDriverName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [permitNumber, setPermitNumber] = useState('');
  const [temperatureUnit, setTemperatureUnit] = useState('metric');
  const [distanceUnit, setDistanceUnit] = useState('metric');
  const [hasAgreed, setHasAgreed] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const selectedOptionStyle = {
    borderColor: theme.colors.primary,
    backgroundColor: isDark ? theme.colors.surfaceSecondary : '#eff6ff',
  };

  useEffect(() => {
    const animationFrame = requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [step]);

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
    return day > 0 && night >= 0 && night <= day;
  };

  const validateGoals = () => {
    const { day, night } = parseGoalValues();

    if (day <= 0 || night < 0) {
      Alert.alert('Invalid Hours', 'Total required hours must be greater than 0, and night hours cannot be negative.');
      return false;
    }

    if (night > day) {
      Alert.alert('Invalid Goal', 'Night hours must be part of the total required hours.');
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

  const handleDriverInfoContinue = () => {
    setStep(4);
  };

  const renderUnitOption = ({ option, isSelected, onPress }) => (
    <TouchableOpacity
      key={option.id}
      activeOpacity={1}
      style={[
        styles.optionCard,
        styles.unitOptionCard,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light },
        isSelected && [styles.selectedOption, selectedOptionStyle],
      ]}
      onPress={onPress}
    >
      <View style={styles.unitOptionContent}>
        <Text style={[styles.optionTitle, styles.unitOptionTitle, { color: theme.colors.text.primary }]}>
          {option.title}
        </Text>
        <Text style={[styles.optionDescription, { color: theme.colors.text.secondary }]}>
          {option.description}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const openDateOfBirthPicker = () => {
    DateTimePickerAndroid.open({
      value: getDateOfBirthDate(dateOfBirth) || new Date(1980, 0, 1),
      mode: 'date',
      minimumDate: getMinimumDateOfBirthDate(),
      maximumDate: new Date(),
      onChange: (event, selectedDate) => {
        if (event.type !== 'set' || !selectedDate) return;
        setDateOfBirth(formatDateOfBirthFromDate(selectedDate));
      },
    });
  };

  const handleComplete = async () => {
    if (isCompleting) {
      return;
    }

    if (!hasAgreed) {
      Alert.alert('Agreement Required', 'Please agree to the data storage terms to continue.');
      return;
    }

    if (!validateGoals()) {
      return;
    }

    const { day: parsedDayHours, night: parsedNightHours } = parseGoalValues();
    const userInfo = {
      licenseType,
      licenseDate: new Date().toISOString().split('T')[0],
      goalDayHours: parsedDayHours,
      goalNightHours: parsedNightHours,
      completedDayHours: 0,
      completedNightHours: 0,
      driverName: driverName.trim(),
      dateOfBirth: dateOfBirth.trim(),
      permitNumber: permitNumber.trim(),
    };

    setIsCompleting(true);

    const didComplete = await completeOnboarding({
      userInfo,
      settings: { temperatureUnit, distanceUnit },
    });

    if (!didComplete) {
      setIsCompleting(false);
      Alert.alert('Setup Error', 'Drively could not save your setup. Please try again.');
      return;
    }

    requestOnboardingPermissions();
    // Navigation will happen automatically when onboardingComplete becomes true
  };

  const requestOnboardingPermissions = async () => {
    const permissionSettings = {};

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

    try {
      permissionSettings.notificationPermissionStatus = await requestNotificationPermission();
    } catch (error) {
      console.log('Notification permission error:', error);
      permissionSettings.notificationPermissionStatus = 'error';
    }

    try {
      const storagePermission = await requestStoragePermission();
      permissionSettings.storagePermissionStatus = storagePermission.status;
      permissionSettings.exportDirectoryUri = storagePermission.directoryUri;
    } catch (error) {
      console.log('Storage permission error:', error);
      permissionSettings.storagePermissionStatus = 'error';
    }

    updateSettings(permissionSettings);
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
            activeOpacity={1}
            style={[
              styles.optionCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light },
              licenseType === type.id && [styles.selectedOption, selectedOptionStyle],
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
            activeOpacity={1}
            style={[
              styles.goalCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light },
              !customGoal && Number(dayHours) === preset.dayHours && Number(nightHours) === preset.nightHours && [
                styles.selectedOption, 
                selectedOptionStyle
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
          activeOpacity={1}
          style={[
            styles.goalCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light },
            customGoal && [styles.selectedOption, selectedOptionStyle]
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
              <Text style={[styles.inputLabel, { color: theme.colors.text.primary }]}>Total Required Hours</Text>
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
                placeholder="e.g. 50"
                placeholderTextColor={theme.colors.text.light}
              />
            </View>
            <View style={styles.goalInputBlock}>
              <Text style={[styles.inputLabel, { color: theme.colors.text.primary }]}>Night Minimum Hours</Text>
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
            Night hours count toward the total. Current goal: {parseGoalValues().day || 0} total hours, including {parseGoalValues().night || 0} at night.
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
      <Text style={[styles.stepTitle, { color: theme.colors.text.primary }]}>Driver Information</Text>
      <Text style={[styles.stepSubtitle, { color: theme.colors.text.secondary }]}>
        This information appears on official exports.
      </Text>

      <View style={styles.formContainer}>
        <View style={styles.formGroup}>
          <Text style={[styles.inputLabel, { color: theme.colors.text.primary }]}>Driver Name</Text>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border.light,
                color: theme.colors.text.primary,
              },
            ]}
            value={driverName}
            onChangeText={setDriverName}
            placeholder="Full name"
            placeholderTextColor={theme.colors.text.light}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.inputLabel, { color: theme.colors.text.primary }]}>Date of Birth</Text>
          <TouchableOpacity
            style={[
              styles.datePickerButton,
              {
                backgroundColor: theme.colors.surfaceSecondary,
                borderColor: theme.colors.border.medium,
              },
            ]}
            onPress={openDateOfBirthPicker}
          >
            <Text
              style={[
                styles.datePickerText,
                { color: theme.colors.text.primary },
                !dateOfBirth && { color: theme.colors.text.light },
              ]}
            >
              {dateOfBirth || 'Date of birth'}
            </Text>
            <Icon name="calendar-month-outline" size={20} color={theme.colors.text.secondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.inputLabel, { color: theme.colors.text.primary }]}>Permit/License Number</Text>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border.light,
                color: theme.colors.text.primary,
              },
            ]}
            value={permitNumber}
            onChangeText={setPermitNumber}
            placeholder="Optional"
            placeholderTextColor={theme.colors.text.light}
            autoCapitalize="characters"
          />
        </View>
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
          onPress={handleDriverInfoContinue}
        >
          <Text style={[styles.nextButtonText, { color: theme.colors.text.inverse }]}>Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.colors.text.primary }]}>Units</Text>
      <Text style={[styles.stepSubtitle, { color: theme.colors.text.secondary }]}>
        Choose how Drively displays weather, distance, and speed.
      </Text>

      <Text style={[styles.optionGroupTitle, { color: theme.colors.text.primary }]}>Temperature</Text>
      <View style={styles.optionsContainer}>
        {TEMPERATURE_OPTIONS.map((option) => renderUnitOption({
          option,
          isSelected: temperatureUnit === option.id,
          onPress: () => setTemperatureUnit(option.id),
        }))}
      </View>

      <Text style={[styles.optionGroupTitle, { color: theme.colors.text.primary }]}>Distance and Speed</Text>
      <View style={styles.optionsContainer}>
        {DISTANCE_OPTIONS.map((option) => renderUnitOption({
          option,
          isSelected: distanceUnit === option.id,
          onPress: () => setDistanceUnit(option.id),
        }))}
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.backButton, { borderColor: theme.colors.border.medium }]}
          onPress={() => setStep(3)}
        >
          <Text style={[styles.backButtonText, { color: theme.colors.text.secondary }]}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: theme.colors.primary }]}
          onPress={() => setStep(5)}
        >
          <Text style={[styles.nextButtonText, { color: theme.colors.text.inverse }]}>Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep5 = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: theme.colors.text.primary }]}>Important Notice</Text>
      
      <View style={[styles.noticeContainer, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.noticeText, { color: theme.colors.text.primary }]}>
          <Text style={[styles.boldText, { color: theme.colors.text.primary }]}>Data Storage:</Text> This app stores all your driving log data locally on your device. 
          Your data is never sent to the cloud or shared with third parties.
        </Text>
        
        <Text style={[styles.noticeText, { color: theme.colors.text.primary }]}>
          <Text style={[styles.boldText, { color: theme.colors.text.primary }]}>Location & Weather:</Text> Your location coordinates WILL be sent to our server 
          to fetch weather data for your drives. Coordinates are used only for weather lookup and are not stored in app debug logs.
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
          onPress={() => setStep(4)}
        >
          <Text style={[styles.backButtonText, { color: theme.colors.text.secondary }]}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.continueButton, 
            { backgroundColor: theme.colors.primary },
            (!hasAgreed || isCompleting) && [styles.disabledButton, { backgroundColor: theme.colors.gray[400] }]
          ]}
          onPress={handleComplete}
          disabled={!hasAgreed || isCompleting}
        >
          <Text style={[styles.continueButtonText, { color: theme.colors.text.inverse }]}>
            {isCompleting ? 'Starting...' : 'Get Started'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView ref={scrollViewRef} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.logo, { color: theme.colors.primary }]}>Drively</Text>
          <Text style={[styles.subtitle, { color: theme.colors.text.secondary }]}>Your driving companion</Text>
          
          <View style={styles.progressContainer}>
            {[1, 2, 3, 4, 5].map((num) => (
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
        {step === 5 && renderStep5()}

        <View style={styles.footer}>
          <Text style={[styles.footerBrand, { color: theme.colors.text.secondary }]}>Drively</Text>
          <Text style={[styles.footerTagline, { color: theme.colors.text.light }]}>
            Small trips, big progress.
          </Text>
        </View>
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
  footer: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 8,
    gap: 4,
  },
  footerBrand: {
    fontSize: 13,
    fontWeight: '700',
  },
  footerTagline: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
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
  unitOptionCard: {
    minHeight: 104,
    justifyContent: 'center',
  },
  unitOptionContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  selectedOption: {
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
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
  unitOptionTitle: {
    marginBottom: 0,
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
  formContainer: {
    gap: 16,
    marginBottom: 32,
  },
  formGroup: {
    gap: 6,
  },
  textInput: {
    borderWidth: 2,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
  },
  datePickerButton: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  datePickerText: {
    flex: 1,
    fontSize: 15,
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
  optionGroupTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
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
