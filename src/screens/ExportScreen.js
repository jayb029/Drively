import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Share,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme } from '../contexts/ThemeContext';
import { exportDataAsJSON, exportDrivesAsCSV } from '../utils/storage';
import { generatePDFReport } from '../utils/pdf';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

export default function ExportScreen({ navigation }) {
  const { drives, supervisorProfiles, user, streaks, settings, updateSettings } = useDriving();
  const { theme } = useTheme();
  const [exporting, setExporting] = useState(false);
  const [isOfficialPDF, setIsOfficialPDF] = useState(false);
  const [leaveSupervisorSignatureBlank, setLeaveSupervisorSignatureBlank] = useState(false);
  const [exportMode, setExportMode] = useState('share');

  // Create styles using current theme
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    if (!isOfficialPDF) {
      setLeaveSupervisorSignatureBlank(false);
    }
  }, [isOfficialPDF]);

  const saveFileWithPicker = async (content, fileName, mimeType) => {
    try {
      if (Platform.OS === 'android') {
        try {
          const directoryUri = await getAndroidExportDirectoryUri();

          if (!directoryUri) {
            Alert.alert('Permission Required', 'Please grant storage permission to save files.');
            return;
          }

          // Create the file in the selected directory
          const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            directoryUri,
            fileName,
            mimeType
          );

          // Write content directly to the SAF URI
          await FileSystem.writeAsStringAsync(fileUri, content, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          Alert.alert('File Saved', `${fileName} has been saved successfully!`);
        } catch (androidError) {
          console.error('Android SAF error:', androidError);
          // Try alternative Downloads directory approach
          try {
            const tempFileUri = `${FileSystem.cacheDirectory}${fileName}`;
            await FileSystem.writeAsStringAsync(tempFileUri, content);
            const savedPath = await saveToDownloads(tempFileUri, fileName, false);
            Alert.alert('File Saved', `${fileName} has been saved to Downloads folder!`);
          } catch (downloadsError) {
            console.error('Downloads save failed:', downloadsError);
            // Final fallback to sharing if both methods fail
            const tempFileUri = `${FileSystem.cacheDirectory}${fileName}`;
            await FileSystem.writeAsStringAsync(tempFileUri, content);
            
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(tempFileUri, {
                mimeType,
                dialogTitle: `Save ${fileName}`,
              });
            } else {
              throw new Error('Unable to save or share file');
            }
          }
        }
        
      } else if (Platform.OS === 'ios') {
        // For iOS, create a temporary file and use the share sheet to save
        const tempFileUri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(tempFileUri, content);
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(tempFileUri, {
            mimeType,
            dialogTitle: `Save ${fileName}`,
            UTI: mimeType === 'application/json' ? 'public.json' :
                 mimeType === 'text/csv' ? 'public.comma-separated-values-text' :
                 mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined,
          });
        } else {
          // Fallback: save to Documents directory
          const documentsUri = `${FileSystem.documentDirectory}${fileName}`;
          await FileSystem.writeAsStringAsync(documentsUri, content);
          Alert.alert('File Saved', `${fileName} saved to app Documents folder`);
        }
      } else {
        // For web and other platforms, fallback to download
        const tempFileUri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(tempFileUri, content);
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(tempFileUri, {
            mimeType,
            dialogTitle: `Save ${fileName}`,
          });
        } else {
          Alert.alert('File Ready', `${fileName} is ready for download`);
        }
      }
    } catch (error) {
      console.error('Save file error:', error);
      throw error;
    }
  };

  const getAndroidExportDirectoryUri = async () => {
    if (Platform.OS !== 'android') return null;

    if (settings.exportDirectoryUri) {
      return settings.exportDirectoryUri;
    }

    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) {
      updateSettings({ storagePermissionStatus: 'denied', exportDirectoryUri: null });
      return null;
    }

    updateSettings({
      storagePermissionStatus: 'granted',
      exportDirectoryUri: permissions.directoryUri,
    });
    return permissions.directoryUri;
  };

  // Alternative Android save method using Downloads directory
  const saveToDownloads = async (sourceUri, fileName, isBase64 = false) => {
    try {
      if (Platform.OS !== 'android') {
        throw new Error('This method is only for Android');
      }

      // Use the public Downloads directory
      const downloadsPath = `${FileSystem.documentDirectory}../Download/`;
      const finalPath = `${downloadsPath}${fileName}`;

      // Ensure downloads directory exists
      const dirInfo = await FileSystem.getInfoAsync(downloadsPath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(downloadsPath, { intermediates: true });
      }

      if (isBase64) {
        // For PDFs, read as base64 and write
        const content = await FileSystem.readAsStringAsync(sourceUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.writeAsStringAsync(finalPath, content, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        // For text files, direct copy
        await FileSystem.copyAsync({
          from: sourceUri,
          to: finalPath,
        });
      }

      return finalPath;
    } catch (error) {
      console.error('Downloads save error:', error);
      throw error;
    }
  };

  const exportJSONBackup = async () => {
    try {
      setExporting(true);
      
      const jsonData = await exportDataAsJSON();
      if (!jsonData) {
        throw new Error('Failed to generate JSON data');
      }

      const fileName = `drively_backup_${new Date().toISOString().split('T')[0]}.json`;

      if (exportMode === 'share') {
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, jsonData);
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/json',
            dialogTitle: 'Export Driving Data',
          });
        } else {
          Alert.alert('Sharing Not Available', 'Sharing is not available on this device.');
        }
      } else {
        await saveFileWithPicker(jsonData, fileName, 'application/json');
      }
      
    } catch (error) {
      console.error('Export JSON error:', error);
      Alert.alert('Export Failed', 'Unable to export JSON data. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportJSON = () => {
    Alert.alert(
      'Export complete backup?',
      'This JSON file contains your full Drively logbook, including driver, supervisor, drive, and location-derived records. Only save or share it with a destination you trust.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: exportJSONBackup },
      ]
    );
  };

  const handleExportCSV = async () => {
    try {
      setExporting(true);
      
      const csvData = await exportDrivesAsCSV();
      if (!csvData) {
        throw new Error('Failed to generate CSV data');
      }

      const fileName = `drively_drives_${new Date().toISOString().split('T')[0]}.csv`;

      if (exportMode === 'share') {
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, csvData);
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: 'Export Drive History',
          });
        } else {
          Alert.alert('Sharing Not Available', 'Sharing is not available on this device.');
        }
      } else {
        await saveFileWithPicker(csvData, fileName, 'text/csv');
      }
      
    } catch (error) {
      console.error('Export CSV error:', error);
      Alert.alert('Export Failed', 'Unable to export CSV data. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      setExporting(true);
      
      const data = { drives, supervisorProfiles, user, streaks };
      const pdfUri = await generatePDFReport(data, null, isOfficialPDF, {
        omitSupervisorSignatures: isOfficialPDF && leaveSupervisorSignatureBlank,
      });
      
      if (exportMode === 'share') {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(pdfUri, {
            mimeType: 'application/pdf',
            dialogTitle: isOfficialPDF ? 'Export Official Driving Report' : 'Export Driving Report',
          });
        } else {
          Alert.alert('Sharing Not Available', 'Sharing is not available on this device.');
        }
      } else {
        // For save mode, we need to handle PDF specially
        const fileName = `drively_report_${new Date().toISOString().split('T')[0]}.pdf`;
        
        if (Platform.OS === 'android') {
          try {
            const directoryUri = await getAndroidExportDirectoryUri();

            if (!directoryUri) {
              Alert.alert('Permission Required', 'Please grant storage permission to save files.');
              return;
            }

            // Read the PDF content as base64
            const pdfContent = await FileSystem.readAsStringAsync(pdfUri, {
              encoding: FileSystem.EncodingType.Base64,
            });

            // Create the file in the selected directory
            const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
              directoryUri,
              fileName,
              'application/pdf'
            );

            // Write the content directly instead of copying
            await FileSystem.writeAsStringAsync(fileUri, pdfContent, {
              encoding: FileSystem.EncodingType.Base64,
            });
            
            Alert.alert('File Saved', `${fileName} has been saved successfully!`);
          } catch (androidError) {
            console.error('Android save error:', androidError);
            // Try alternative Downloads directory approach
            try {
              const savedPath = await saveToDownloads(pdfUri, fileName, true);
              Alert.alert('File Saved', `${fileName} has been saved to Downloads folder!`);
            } catch (downloadsError) {
              console.error('Downloads save failed:', downloadsError);
              // Final fallback to sharing on Android if both methods fail
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(pdfUri, {
                  mimeType: 'application/pdf',
                  dialogTitle: `Save ${fileName}`,
                });
              } else {
                throw new Error('Unable to save or share PDF file');
              }
            }
          }
        } else {
          // For iOS and other platforms, use sharing
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(pdfUri, {
              mimeType: 'application/pdf',
              dialogTitle: `Save ${fileName}`,
              UTI: 'com.adobe.pdf',
            });
          } else {
            Alert.alert('File Ready', `${fileName} is ready for download`);
          }
        }
      }
      
    } catch (error) {
      console.error('Export PDF error:', error);
      Alert.alert('Export Failed', 'Unable to export PDF report. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleShareSummary = async () => {
    try {
      const totalHours = user.completedDayHours + user.completedNightHours;
      const goalHours = user.goalDayHours;
      const progressPercent = Math.round((totalHours / Math.max(goalHours, 1)) * 100);
      
      const message = `🛣️ My Driving Progress with Drively:\n\n` +
        `✅ ${totalHours.toFixed(1)} / ${goalHours} hours completed (${progressPercent}%)\n` +
        `☀️ Day driving: ${user.completedDayHours.toFixed(1)} hours\n` +
        `🌙 Night driving: ${user.completedNightHours.toFixed(1)} / ${user.goalNightHours} minimum hours\n\n` +
        `🔥 Current streak: ${streaks.current} days\n` +
        `🏆 Longest streak: ${streaks.longest} days\n\n` +
        `#DrivingProgress #Drively`;

      await Share.share({
        message,
        title: 'My Driving Progress',
      });
      
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert('Share Failed', 'Unable to share progress. Please try again.');
    }
  };

  const exportOptions = [
    {
      id: 'json',
      title: 'Complete Backup (JSON)',
      description: exportMode === 'share' 
        ? 'Share full data backup with another device or service'
        : 'Choose location to save full data backup with file picker',
      icon: '💾',
      onPress: handleExportJSON,
    },
    {
      id: 'csv',
      title: 'Drive History (CSV)',
      description: exportMode === 'share'
        ? 'Share spreadsheet-friendly format with drive details'
        : 'Choose location to save spreadsheet-friendly drive data',
      icon: '📊',
      onPress: handleExportCSV,
    },
    {
      id: 'pdf',
      title: 'Summary Report (PDF)',
      description: exportMode === 'share'
        ? 'Share professional PDF report with progress summary'
        : 'Choose location to save professional PDF report',
      icon: '📄',
      onPress: handleExportPDF,
    },
    ...(exportMode === 'share' ? [{
      id: 'share',
      title: 'Share Progress Text',
      description: 'Share your driving progress as text on social media',
      icon: '📱',
      onPress: handleShareSummary,
    }] : []),
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Icon name="arrow-left" size={21} color={theme.colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.title}>Export & Share</Text>
            <View style={styles.headerSpacer} />
          </View>
          <Text style={styles.subtitle}>
            {exportMode === 'share' 
              ? 'Share your data with other apps or devices'
              : 'Choose where to save your data files'
            }
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setExportMode(exportMode === 'share' ? 'save' : 'share')}
            style={styles.modeToggle}
          >
            <Icon
              name={exportMode === 'share' ? 'folder-outline' : 'share-variant-outline'}
              size={17}
              color={theme.colors.primary}
            />
            <Text style={styles.modeToggleText}>
              {exportMode === 'share' ? 'Save files instead' : 'Share files instead'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Statistics Overview */}
        <View style={styles.statsContainer}>
          <Text style={styles.statsTitle}>Current Progress</Text>
          
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Total Drives:</Text>
            <Text style={styles.statValue}>{drives.length}</Text>
          </View>
          
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Total Hours:</Text>
            <Text style={styles.statValue}>
              {(user.completedDayHours + user.completedNightHours).toFixed(1)}
            </Text>
          </View>
          
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Progress:</Text>
            <Text style={styles.statValue}>
              {Math.round(((user.completedDayHours + user.completedNightHours) / 
                Math.max(user.goalDayHours, 1)) * 100)}%
            </Text>
          </View>
          
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Current Streak:</Text>
            <Text style={styles.statValue}>{streaks.current} days</Text>
          </View>
        </View>

        {/* Export Options */}
        <View style={styles.optionsContainer}>
          <Text style={styles.optionsTitle}>Export Options</Text>
          
          {exportOptions.map((option) => (
            <View key={option.id}>
              <TouchableOpacity
                style={styles.optionCard}
                onPress={option.onPress}
                disabled={exporting}
              >
                <View style={styles.optionIcon}>
                  <Text style={styles.optionIconText}>{option.icon}</Text>
                </View>
                
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>{option.title}</Text>
                  <Text style={styles.optionDescription}>{option.description}</Text>
                </View>
                
                <View style={styles.optionAction}>
                  <Text style={styles.actionText}>
                    {exporting ? '...' : '→'}
                  </Text>
                </View>
              </TouchableOpacity>
              
              {/* PDF Options Checkbox */}
              {option.id === 'pdf' && (
                <View style={styles.pdfOptionsContainer}>
                  <View style={styles.checkboxRow}>
                    <Switch
                      value={isOfficialPDF}
                      onValueChange={setIsOfficialPDF}
                      trackColor={{ 
                        false: theme.colors.switchControl.trackOff, 
                        true: theme.colors.switchControl.trackOn 
                      }}
                      thumbColor={isOfficialPDF ? theme.colors.switchControl.thumbOn : theme.colors.switchControl.thumbOff}
                    />
                    <View style={styles.checkboxLabel}>
                      <Text style={styles.checkboxTitle}>Official/DMV Format</Text>
                      <Text style={styles.checkboxDescription}>
                        {isOfficialPDF 
                          ? 'Clean format without emojis, includes DMV-style certification and signature sections'
                          : 'Personal format with emojis, streaks and progress tracking'
                        }
                      </Text>
                    </View>
                  </View>

                  {isOfficialPDF && (
                    <View style={[styles.checkboxRow, styles.pdfSubOptionRow]}>
                      <Switch
                        value={leaveSupervisorSignatureBlank}
                        onValueChange={setLeaveSupervisorSignatureBlank}
                        trackColor={{ 
                          false: theme.colors.switchControl.trackOff, 
                          true: theme.colors.switchControl.trackOn 
                        }}
                        thumbColor={leaveSupervisorSignatureBlank ? theme.colors.switchControl.thumbOn : theme.colors.switchControl.thumbOff}
                      />
                      <View style={styles.checkboxLabel}>
                        <Text style={styles.checkboxTitle}>Blank signature version</Text>
                        <Text style={styles.checkboxDescription}>
                          Keep saved signatures in the app, but export physical signature and date lines for supervisors to sign later. Turn off to export saved signatures.
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Backup Reminder */}
        <View style={styles.reminderContainer}>
          <Text style={styles.reminderTitle}>
            {exportMode === 'share' ? '📤 Sharing Tip' : '💡 Backup Reminder'}
          </Text>
          <Text style={styles.reminderText}>
            {exportMode === 'share' 
              ? 'Share your driving data with cloud storage apps for automatic backup, or send to another device for safekeeping.'
              : Platform.OS === 'android'
                ? 'On Android, you\'ll be able to choose exactly where to save your files using the built-in folder picker.'
                : 'Use the share sheet to save files to your preferred location - Files app, cloud storage, or other apps.'
            }
          </Text>
        </View>

        {/* Data Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>
            {exportMode === 'share' ? 'About Sharing' : 'About Your Data'}
          </Text>
          <Text style={styles.infoText}>
            {exportMode === 'share' 
              ? '• Files are shared securely through your device\'s sharing system\n• Choose from apps like email, cloud storage, messaging, etc.\n• JSON files can be imported back into Drively\n• CSV files work with Excel, Sheets, and other apps\n• PDF reports support both personal and official/DMV formats\n• All data remains private and under your control'
              : Platform.OS === 'android'
                ? '• Android folder picker lets you choose exact save location\n• Save to internal storage, SD card, or cloud storage\n• JSON files can be imported back into Drively\n• CSV files work with Excel, Sheets, and other apps\n• PDF reports support both personal and official/DMV formats\n• All data remains private and under your control'
                : '• Use iOS share sheet to save to Files app or cloud storage\n• Compatible with iCloud Drive, Google Drive, Dropbox, etc.\n• JSON files can be imported back into Drively\n• CSV files work with Excel, Sheets, and other apps\n• PDF reports support both personal and official/DMV formats\n• All data remains private and under your control'
            }
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Helper function to add transparency to hex colors
const addTransparency = (hexColor, opacity) => {
  // Remove # if present
  const color = hexColor.replace('#', '');
  // Convert hex to rgb
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);
  // Return rgba
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

// Create styles function that takes theme parameter
const createStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    minHeight: 40,
    marginTop: 10,
  },
  modeToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 24,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 7,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    elevation: 0,
  },
  headerSpacer: {
    width: 40, // Same width as back button to center the title
  },
  title: {
    fontFamily: theme.typography.families.display,
    fontSize: 27,
    fontWeight: '700',
    color: theme.colors.text.primary,
    textAlign: 'center',
    flex: 1,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.text.secondary,
  },
  statsContainer: {
    backgroundColor: theme.colors.surface,
    padding: 20,
    borderRadius: 7,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text.primary,
    marginBottom: 16,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  optionsContainer: {
    marginBottom: 24,
  },
  optionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text.primary,
    marginBottom: 16,
  },
  optionCard: {
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 7,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIcon: {
    width: 32,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  optionIconText: {
    fontSize: 20,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  optionAction: {
    width: 24,
    alignItems: 'center',
  },
  actionText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text.secondary,
  },
  pdfOptionsContainer: {
    backgroundColor: theme.colors.surfaceSecondary,
    marginLeft: 16,
    marginRight: 16,
    marginTop: -8,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderTopWidth: 0,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pdfSubOptionRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.light,
  },
  checkboxLabel: {
    flex: 1,
  },
  checkboxTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: 2,
  },
  checkboxDescription: {
    fontSize: 12,
    color: theme.colors.text.secondary,
  },
  reminderContainer: {
    backgroundColor: addTransparency(theme.colors.warning, 0.1),
    padding: 16,
    borderRadius: 7,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.colors.warning,
  },
  reminderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.warning,
    marginBottom: 8,
  },
  reminderText: {
    fontSize: 14,
    color: theme.colors.warning,
    lineHeight: 20,
  },
  infoContainer: {
    backgroundColor: theme.colors.surface,
    padding: 20,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: theme.colors.text.secondary,
    lineHeight: 20,
  },
});
