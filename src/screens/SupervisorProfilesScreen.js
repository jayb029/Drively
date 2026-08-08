import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Svg, { Path } from 'react-native-svg';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme } from '../contexts/ThemeContext';
import { SensitiveBlock, SensitiveText } from '../components/SensitiveInfo';
import {
  calculateAge,
  formatDateOfBirthFromDate,
  formatDateOfBirthInput,
  getDateOfBirthDate,
  getMinimumDateOfBirthDate,
  isValidDateOfBirth,
} from '../utils/time';

const SIGNATURE_HEIGHT = 160;

const emptyForm = {
  name: '',
  relationship: '',
  dateOfBirth: '',
  licenseNumber: '',
  phone: '',
  signature: null,
};

export default function SupervisorProfilesScreen({ navigation }) {
  const {
    addSupervisorProfile,
    deleteSupervisorProfile,
    supervisorProfiles,
    updateSupervisorProfile,
  } = useDriving();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [activeMenu, setActiveMenu] = useState('saved');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showSignaturePrompt, setShowSignaturePrompt] = useState(false);
  const [draftSignaturePaths, setDraftSignaturePaths] = useState([]);
  const [currentPath, setCurrentPath] = useState('');
  const [draftSignatureWidth, setDraftSignatureWidth] = useState(320);
  const [saveAfterSignature, setSaveAfterSignature] = useState(false);

  const currentPathRef = useRef('');

  const getBoundedSignaturePoint = (event) => {
    const { locationX, locationY } = event.nativeEvent;
    return {
      x: Math.min(Math.max(0, locationX), draftSignatureWidth),
      y: Math.min(Math.max(0, locationY), SIGNATURE_HEIGHT),
    };
  };

  const finishSignatureStroke = () => {
    const finishedPath = currentPathRef.current;
    if (finishedPath) {
      setDraftSignaturePaths((paths) => [...paths, finishedPath]);
    }

    currentPathRef.current = '';
    setCurrentPath('');
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event) => {
      const { x, y } = getBoundedSignaturePoint(event);
      const path = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      currentPathRef.current = path;
      setCurrentPath(path);
    },
    onPanResponderMove: (event) => {
      if (!currentPathRef.current) return;

      const { x, y } = getBoundedSignaturePoint(event);
      const nextPath = `${currentPathRef.current} L ${x.toFixed(1)} ${y.toFixed(1)}`;
      currentPathRef.current = nextPath;
      setCurrentPath(nextPath);
    },
    onPanResponderRelease: finishSignatureStroke,
    onPanResponderTerminate: finishSignatureStroke,
    onShouldBlockNativeResponder: () => true,
  }), [draftSignatureWidth]);

  const startNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDraftSignaturePaths([]);
    setCurrentPath('');
    setActiveMenu('save');
  };

  const startEdit = (profile) => {
    setEditingId(profile.id);
    setForm({
      name: profile.name || '',
      relationship: profile.relationship || '',
      dateOfBirth: formatDateOfBirthInput(profile.dateOfBirth || profile.birthDate || profile.dob || ''),
      licenseNumber: profile.licenseNumber || '',
      phone: profile.phone || '',
      signature: profile.signature || null,
    });
    setDraftSignaturePaths([]);
    setDraftSignatureWidth(profile.signature?.width || 320);
    setCurrentPath('');
    setActiveMenu('save');
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDraftSignaturePaths([]);
    setCurrentPath('');
    setSaveAfterSignature(false);
    setActiveMenu('saved');
  };

  const buildPayload = (signature) => {
    const calculatedAge = calculateAge(form.dateOfBirth);
    return {
      name: form.name.trim(),
      relationship: form.relationship.trim() || 'Supervisor',
      dateOfBirth: form.dateOfBirth.trim() || null,
      age: calculatedAge,
      licenseNumber: form.licenseNumber.trim() || null,
      phone: form.phone.trim() || null,
      signature,
      signatureCapturedAt: new Date().toISOString(),
    };
  };

  const validateForm = () => {
    const name = form.name.trim();
    const dateOfBirth = form.dateOfBirth.trim();
    const calculatedAge = calculateAge(dateOfBirth);

    if (!name) {
      Alert.alert('Name required', 'Enter the supervisor name.');
      return false;
    }

    if (dateOfBirth && !isValidDateOfBirth(dateOfBirth)) {
      Alert.alert('Invalid date of birth', 'Enter the supervisor date of birth as MM/DD/YYYY.');
      return false;
    }

    if (calculatedAge !== null && calculatedAge < 21) {
      Alert.alert('Invalid age', 'Supervisors must be at least 21.');
      return false;
    }

    return true;
  };

  const saveProfileWithSignature = (signature) => {
    const payload = buildPayload(signature);

    if (editingId) {
      updateSupervisorProfile({ id: editingId, ...payload });
    } else {
      addSupervisorProfile(payload);
    }

    resetForm();
  };

  const requestSave = () => {
    if (!validateForm()) return;

    if (!form.signature) {
      openSignaturePrompt(true);
      return;
    }

    saveProfileWithSignature(form.signature);
  };

  const openSignaturePrompt = (shouldSaveAfterSignature = false) => {
    setSaveAfterSignature(shouldSaveAfterSignature);
    setDraftSignaturePaths(form.signature?.paths || []);
    setDraftSignatureWidth(form.signature?.width || 320);
    currentPathRef.current = '';
    setCurrentPath('');
    setShowSignaturePrompt(true);
  };

  const confirmSignature = () => {
    if (draftSignaturePaths.length === 0) {
      Alert.alert('Signature required', 'Please sign inside the box before saving this profile.');
      return;
    }

    const capturedSignature = {
      paths: draftSignaturePaths,
      width: draftSignatureWidth,
      height: SIGNATURE_HEIGHT,
    };

    setForm((current) => ({ ...current, signature: capturedSignature }));
    setShowSignaturePrompt(false);
    setSaveAfterSignature(false);

    if (saveAfterSignature) {
      saveProfileWithSignature(capturedSignature);
    }
  };

  const confirmDelete = (profile) => {
    Alert.alert('Delete supervisor', `Remove ${profile.name}? Existing drive logs will keep the saved name.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSupervisorProfile(profile.id) },
    ]);
  };

  const clearSignature = () => {
    setDraftSignaturePaths([]);
    setCurrentPath('');
    currentPathRef.current = '';
  };

  const removeSavedSignature = () => {
    setForm((current) => ({ ...current, signature: null }));
    setDraftSignaturePaths([]);
    setCurrentPath('');
    currentPathRef.current = '';
  };

  const openDateOfBirthPicker = () => {
    DateTimePickerAndroid.open({
      value: getDateOfBirthDate(form.dateOfBirth) || new Date(1980, 0, 1),
      mode: 'date',
      minimumDate: getMinimumDateOfBirthDate(),
      maximumDate: new Date(),
      onValueChange: (_event, selectedDate) => {
        setForm((current) => ({
          ...current,
          dateOfBirth: formatDateOfBirthFromDate(selectedDate),
        }));
      },
    });
  };

  const signature = form.signature;
  const calculatedAge = calculateAge(form.dateOfBirth);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={styles.headerBackButton}
          >
            <Icon name="arrow-left" size={21} color={theme.colors.text.secondary} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Supervisors</Text>
            <Text style={styles.subtitle}>Profiles and signatures used in your logbook.</Text>
          </View>
        </View>

        <View style={styles.menu}>
          <TouchableOpacity
            style={[styles.menuItem, activeMenu === 'saved' && styles.menuItemActive]}
            onPress={() => setActiveMenu('saved')}
          >
            <Icon name="account-supervisor-outline" size={18} color={activeMenu === 'saved' ? theme.colors.primary : theme.colors.text.secondary} />
            <Text style={[styles.menuText, activeMenu === 'saved' && styles.menuTextActive]}>Saved Profiles</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.menuItem, activeMenu === 'save' && styles.menuItemActive]}
            onPress={startNew}
          >
            <Icon name="content-save-outline" size={18} color={activeMenu === 'save' ? theme.colors.primary : theme.colors.text.secondary} />
            <Text style={[styles.menuText, activeMenu === 'save' && styles.menuTextActive]}>Save Profile</Text>
          </TouchableOpacity>
        </View>

        {activeMenu === 'save' ? (
          <View style={styles.form}>
            <Text style={styles.sectionTitle}>{editingId ? 'Edit Profile' : 'Save Profile'}</Text>
            <Text style={styles.inputLabel}>Full name</Text>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(name) => setForm((current) => ({ ...current, name }))}
              placeholder="Full name"
              placeholderTextColor={theme.colors.text.light}
            />
            <Text style={styles.inputLabel}>Relationship</Text>
            <TextInput
              style={styles.input}
              value={form.relationship}
              onChangeText={(relationship) => setForm((current) => ({ ...current, relationship }))}
              placeholder="Relationship"
              placeholderTextColor={theme.colors.text.light}
            />
            <Text style={styles.inputLabel}>Date of birth</Text>
            <TouchableOpacity style={styles.datePickerButton} onPress={openDateOfBirthPicker}>
              <Text style={[styles.datePickerText, !form.dateOfBirth && styles.datePickerPlaceholder]}>
                {form.dateOfBirth || 'Date of birth'}
              </Text>
              <Icon name="calendar-month-outline" size={20} color={theme.colors.text.secondary} />
            </TouchableOpacity>
            <View style={styles.row}>
              <View style={[styles.calculatedField, styles.rowInput]}>
                <Text style={styles.calculatedLabel}>Age</Text>
                <Text style={styles.calculatedValue}>{calculatedAge === null ? 'Enter DOB' : String(calculatedAge)}</Text>
              </View>
              <TextInput
                style={[styles.input, styles.rowInput]}
                value={form.phone}
                onChangeText={(phone) => setForm((current) => ({ ...current, phone }))}
                placeholder="Phone optional"
                placeholderTextColor={theme.colors.text.light}
                keyboardType="phone-pad"
              />
            </View>
            <Text style={styles.inputLabel}>License number</Text>
            <TextInput
              style={styles.input}
              value={form.licenseNumber}
              onChangeText={(licenseNumber) => setForm((current) => ({ ...current, licenseNumber }))}
              placeholder="License number optional"
              placeholderTextColor={theme.colors.text.light}
              autoCapitalize="characters"
            />

            <View style={styles.signatureSummary}>
              <View style={styles.signatureSummaryText}>
                <Text style={styles.signatureTitle}>Signature</Text>
                <Text style={styles.signatureMeta}>{signature ? 'Signature saved with profile' : 'Required before saving'}</Text>
              </View>
              <TouchableOpacity
                style={styles.secondarySmallButton}
                onPress={() => openSignaturePrompt(false)}
              >
                <Text style={styles.secondarySmallButtonText}>{signature ? 'Edit' : 'Sign'}</Text>
              </TouchableOpacity>
            </View>

            {signature && (
              <View style={styles.savedSignatureBlock}>
                <SensitiveBlock
                  containerStyle={styles.signaturePrivacyButton}
                  hiddenStyle={styles.signaturePreview}
                  revealLabel="Supervisor signature"
                >
                  <SignaturePreview signature={signature} styles={styles} theme={theme} />
                </SensitiveBlock>
                <TouchableOpacity style={styles.removeSignatureButton} onPress={removeSavedSignature}>
                  <Text style={styles.removeSignatureText}>Remove signature</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={resetForm}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={requestSave}>
                <Text style={styles.primaryButtonText}>{editingId ? 'Save Changes' : 'Save Profile'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.list}>
            {supervisorProfiles.length === 0 ? (
              <View style={styles.empty}>
                <Icon name="account-supervisor-outline" size={28} color={theme.colors.text.secondary} />
                <Text style={styles.emptyText}>No supervisors saved yet.</Text>
                <TouchableOpacity style={styles.primaryInlineButton} onPress={startNew}>
                  <Text style={styles.primaryInlineButtonText}>Save Profile</Text>
                </TouchableOpacity>
              </View>
            ) : (
              supervisorProfiles.map((profile) => (
                <View key={profile.id} style={styles.profileCard}>
                  <View style={styles.profileMain}>
                    <SensitiveText
                      value={profile.name}
                      textStyle={styles.profileName}
                      revealLabel="Supervisor name"
                      numberOfLines={1}
                    />
                    <SensitiveText
                      value={[
                        profile.relationship,
                        (profile.dateOfBirth || profile.birthDate || profile.dob) ? `DOB ${profile.dateOfBirth || profile.birthDate || profile.dob}` : null,
                        getProfileAge(profile) ? `${getProfileAge(profile)} years old` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      textStyle={styles.profileMeta}
                      revealLabel="Supervisor details"
                    />
                    <Text style={styles.profileMeta}>
                      {profile.signature ? 'Signature saved' : 'Signature missing'}
                    </Text>
                  </View>
                  <View style={styles.profileActions}>
                    <TouchableOpacity
                      accessibilityLabel={`Edit ${profile.name}`}
                      accessibilityRole="button"
                      style={styles.iconButton}
                      onPress={() => startEdit(profile)}
                    >
                      <Icon name="pencil-outline" size={19} color={theme.colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityLabel={`Delete ${profile.name}`}
                      accessibilityRole="button"
                      style={styles.iconButton}
                      onPress={() => confirmDelete(profile)}
                    >
                      <Icon name="trash-can-outline" size={19} color={theme.colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showSignaturePrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSignaturePrompt(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Supervisor Signature</Text>
            <Text style={styles.modalText}>Have the supervisor sign below. The signature is saved with this profile.</Text>

            <View
              accessible
              accessibilityLabel="Supervisor signature pad"
              style={styles.signaturePad}
              onLayout={(event) => setDraftSignatureWidth(Math.max(1, event.nativeEvent.layout.width))}
              {...panResponder.panHandlers}
            >
              <Svg width="100%" height={SIGNATURE_HEIGHT} viewBox={`0 0 ${draftSignatureWidth} ${SIGNATURE_HEIGHT}`}>
                {draftSignaturePaths.map((path, index) => (
                  <Path key={`${path}-${index}`} d={path} stroke={theme.colors.text.primary} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                ))}
                {!!currentPath && (
                  <Path d={currentPath} stroke={theme.colors.text.primary} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </Svg>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={clearSignature}>
                <Text style={styles.secondaryButtonText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowSignaturePrompt(false)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={confirmSignature}>
                <Text style={styles.primaryButtonText}>{saveAfterSignature ? 'Save Profile' : 'Use Signature'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SignaturePreview({ signature, styles, theme }) {
  return (
    <View style={styles.signaturePreview}>
      <Svg width="100%" height={72} viewBox={`0 0 ${signature.width || 320} ${signature.height || SIGNATURE_HEIGHT}`}>
        {(signature.paths || []).map((path, index) => (
          <Path key={`${path}-${index}`} d={path} stroke={theme.colors.text.primary} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </Svg>
    </View>
  );
}

function getProfileAge(profile) {
  return calculateAge(profile.dateOfBirth || profile.birthDate || profile.dob) ?? profile.age ?? null;
}

function createStyles(theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: 20,
      paddingBottom: 32,
      gap: 20,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    headerBackButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 7,
      backgroundColor: theme.colors.surface,
    },
    headerCopy: {
      flex: 1,
      gap: 2,
    },
    title: {
      color: theme.colors.text.primary,
      fontFamily: theme.typography.families.display,
      fontSize: 30,
      fontWeight: '700',
      letterSpacing: -0.4,
    },
    subtitle: {
      color: theme.colors.text.secondary,
      fontSize: 14,
    },
    menu: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderColor: theme.colors.border.medium,
    },
    menuItem: {
      flex: 1,
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderBottomWidth: 3,
      borderBottomColor: 'transparent',
    },
    menuItemActive: {
      borderBottomColor: theme.colors.primary,
    },
    menuText: {
      color: theme.colors.text.primary,
      fontWeight: '700',
      fontSize: 14,
    },
    menuTextActive: {
      color: theme.colors.primary,
    },
    form: {
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 7,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 10,
    },
    inputLabel: {
      color: theme.colors.text.primary,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: -4,
    },
    sectionTitle: {
      color: theme.colors.text.primary,
      fontSize: 16,
      fontWeight: '700',
    },
    input: {
      minHeight: 46,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      color: theme.colors.text.primary,
      backgroundColor: theme.colors.surfaceSecondary,
      paddingHorizontal: 12,
      fontSize: 15,
    },
    datePickerButton: {
      minHeight: 46,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      backgroundColor: theme.colors.surfaceSecondary,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    datePickerText: {
      flex: 1,
      color: theme.colors.text.primary,
      fontSize: 15,
    },
    datePickerPlaceholder: {
      color: theme.colors.text.light,
    },
    row: {
      flexDirection: 'row',
      gap: 10,
    },
    rowInput: {
      flex: 1,
    },
    calculatedField: {
      minHeight: 46,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      backgroundColor: theme.colors.surfaceSecondary,
      paddingHorizontal: 12,
      justifyContent: 'center',
    },
    calculatedLabel: {
      color: theme.colors.text.secondary,
      fontSize: 12,
      fontWeight: '700',
    },
    calculatedValue: {
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: '700',
      marginTop: 2,
    },
    signatureSummary: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 8,
      paddingHorizontal: 12,
      backgroundColor: theme.colors.surfaceSecondary,
    },
    signatureSummaryText: {
      flex: 1,
    },
    signatureTitle: {
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    signatureMeta: {
      color: theme.colors.text.secondary,
      fontSize: 12,
      marginTop: 2,
    },
    signaturePreview: {
      height: 76,
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceSecondary,
      overflow: 'hidden',
    },
    signaturePrivacyButton: {
      borderRadius: 8,
    },
    savedSignatureBlock: {
      gap: 8,
    },
    removeSignatureButton: {
      minHeight: 38,
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
    },
    removeSignatureText: {
      color: theme.colors.text.primary,
      fontSize: 13,
      fontWeight: '700',
    },
    actionRow: {
      flexDirection: 'row',
      gap: 10,
    },
    primaryButton: {
      flex: 1,
      minHeight: 46,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
    },
    primaryButtonText: {
      color: theme.colors.text.inverse,
      fontWeight: '700',
      fontSize: 15,
    },
    secondaryButton: {
      flex: 1,
      minHeight: 46,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      backgroundColor: theme.colors.surface,
    },
    secondaryButtonText: {
      color: theme.colors.text.primary,
      fontWeight: '700',
      fontSize: 15,
    },
    secondarySmallButton: {
      minHeight: 36,
      paddingHorizontal: 12,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      backgroundColor: theme.colors.surface,
    },
    secondarySmallButtonText: {
      color: theme.colors.text.primary,
      fontSize: 13,
      fontWeight: '700',
    },
    primaryInlineButton: {
      minHeight: 40,
      paddingHorizontal: 14,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
    },
    primaryInlineButtonText: {
      color: theme.colors.text.inverse,
      fontWeight: '700',
      fontSize: 14,
    },
    list: {
      gap: 10,
    },
    empty: {
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 8,
      backgroundColor: theme.colors.surface,
      padding: 20,
      alignItems: 'center',
      gap: 10,
    },
    emptyText: {
      color: theme.colors.text.secondary,
      fontSize: 14,
    },
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 7,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 12,
    },
    profileMain: {
      flex: 1,
      gap: 3,
    },
    profileName: {
      color: theme.colors.text.primary,
      fontSize: 16,
      fontWeight: '700',
    },
    profileMeta: {
      color: theme.colors.text.secondary,
      fontSize: 13,
    },
    profileActions: {
      flexDirection: 'row',
      gap: 8,
    },
    iconButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      backgroundColor: theme.colors.surfaceSecondary,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      padding: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalCard: {
      width: '100%',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      backgroundColor: theme.colors.surface,
      padding: 16,
      gap: 12,
    },
    modalTitle: {
      color: theme.colors.text.primary,
      fontSize: 18,
      fontWeight: '700',
    },
    modalText: {
      color: theme.colors.text.secondary,
      fontSize: 14,
      lineHeight: 20,
    },
    signaturePad: {
      height: SIGNATURE_HEIGHT,
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceSecondary,
      overflow: 'hidden',
    },
    modalActions: {
      flexDirection: 'row',
      gap: 8,
    },
  });
}
