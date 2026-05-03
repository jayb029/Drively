import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  PanResponder,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme } from '../contexts/ThemeContext';

const SIGNATURE_HEIGHT = 160;

const emptyForm = {
  name: '',
  relationship: '',
  dateOfBirth: '',
  age: '',
  licenseNumber: '',
  phone: '',
  signature: null,
};

export default function SupervisorProfilesScreen() {
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
      dateOfBirth: profile.dateOfBirth || profile.birthDate || profile.dob || '',
      age: profile.age ? String(profile.age) : '',
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
    const age = Number(form.age);
    return {
      name: form.name.trim(),
      relationship: form.relationship.trim() || 'Supervisor',
      dateOfBirth: form.dateOfBirth.trim() || null,
      age: form.age ? age : null,
      licenseNumber: form.licenseNumber.trim() || null,
      phone: form.phone.trim() || null,
      signature,
      signatureCapturedAt: new Date().toISOString(),
    };
  };

  const validateForm = () => {
    const name = form.name.trim();
    const age = Number(form.age);

    if (!name) {
      Alert.alert('Name required', 'Enter the supervisor name.');
      return false;
    }

    if (form.age && (!Number.isFinite(age) || age < 21)) {
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

  const signature = form.signature;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Supervisors</Text>
          <Text style={styles.subtitle}>Save supervisor profiles and signatures for official exports.</Text>
        </View>

        <View style={styles.menu}>
          <TouchableOpacity
            style={[styles.menuItem, activeMenu === 'saved' && styles.menuItemActive]}
            onPress={() => setActiveMenu('saved')}
          >
            <Icon name="account-supervisor-outline" size={18} color={activeMenu === 'saved' ? theme.colors.text.inverse : theme.colors.text.primary} />
            <Text style={[styles.menuText, activeMenu === 'saved' && styles.menuTextActive]}>Saved Profiles</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.menuItem, activeMenu === 'save' && styles.menuItemActive]}
            onPress={startNew}
          >
            <Icon name="content-save-outline" size={18} color={activeMenu === 'save' ? theme.colors.text.inverse : theme.colors.text.primary} />
            <Text style={[styles.menuText, activeMenu === 'save' && styles.menuTextActive]}>Save Profile</Text>
          </TouchableOpacity>
        </View>

        {activeMenu === 'save' ? (
          <View style={styles.form}>
            <Text style={styles.sectionTitle}>{editingId ? 'Edit Profile' : 'Save Profile'}</Text>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(name) => setForm((current) => ({ ...current, name }))}
              placeholder="Full name"
              placeholderTextColor={theme.colors.text.light}
            />
            <TextInput
              style={styles.input}
              value={form.relationship}
              onChangeText={(relationship) => setForm((current) => ({ ...current, relationship }))}
              placeholder="Relationship"
              placeholderTextColor={theme.colors.text.light}
            />
            <TextInput
              style={styles.input}
              value={form.dateOfBirth}
              onChangeText={(dateOfBirth) => setForm((current) => ({ ...current, dateOfBirth }))}
              placeholder="Date of birth"
              placeholderTextColor={theme.colors.text.light}
              keyboardType="numbers-and-punctuation"
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.rowInput]}
                value={form.age}
                onChangeText={(age) => setForm((current) => ({ ...current, age: age.replace(/[^0-9]/g, '') }))}
                placeholder="Age"
                placeholderTextColor={theme.colors.text.light}
                keyboardType="numeric"
                maxLength={2}
              />
              <TextInput
                style={[styles.input, styles.rowInput]}
                value={form.phone}
                onChangeText={(phone) => setForm((current) => ({ ...current, phone }))}
                placeholder="Phone optional"
                placeholderTextColor={theme.colors.text.light}
                keyboardType="phone-pad"
              />
            </View>
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
                <SignaturePreview signature={signature} styles={styles} theme={theme} />
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
                    <Text style={styles.profileName}>{profile.name}</Text>
                    <Text style={styles.profileMeta}>
                      {[
                        profile.relationship,
                        (profile.dateOfBirth || profile.birthDate || profile.dob) ? `DOB ${profile.dateOfBirth || profile.birthDate || profile.dob}` : null,
                        profile.age ? `${profile.age} years old` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    <Text style={styles.profileMeta}>
                      {profile.signature ? 'Signature saved' : 'Signature missing'}
                    </Text>
                  </View>
                  <View style={styles.profileActions}>
                    <TouchableOpacity style={styles.iconButton} onPress={() => startEdit(profile)}>
                      <Icon name="pencil-outline" size={19} color={theme.colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconButton} onPress={() => confirmDelete(profile)}>
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

function createStyles(theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: 20,
      paddingBottom: 112,
      gap: 18,
    },
    header: {
      gap: 3,
    },
    title: {
      color: theme.colors.text.primary,
      fontSize: 26,
      fontWeight: '700',
    },
    subtitle: {
      color: theme.colors.text.secondary,
      fontSize: 14,
    },
    menu: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: theme.colors.surface,
    },
    menuItem: {
      flex: 1,
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    menuItemActive: {
      backgroundColor: theme.colors.primary,
    },
    menuText: {
      color: theme.colors.text.primary,
      fontWeight: '700',
      fontSize: 14,
    },
    menuTextActive: {
      color: theme.colors.text.inverse,
    },
    form: {
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 8,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 10,
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
    row: {
      flexDirection: 'row',
      gap: 10,
    },
    rowInput: {
      flex: 1,
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
      borderRadius: 8,
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
