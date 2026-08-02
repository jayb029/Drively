import React from 'react';
import {
  SettingsChoice,
  SettingsPage,
  SettingsSection,
  SettingsSwitchRow,
} from '../components/SettingsComponents';
import { useDriving } from '../contexts/DrivingContext';

export default function WeatherSettingsScreen({ navigation }) {
  const { settings, updateSettings } = useDriving();
  const enabled = settings.weatherEnabled ?? true;

  return (
    <SettingsPage navigation={navigation} title="Weather lookup" subtitle="Control whether Drively fetches conditions for new drive logs.">
      <SettingsSection title="Automatic lookup">
        <SettingsSwitchRow
          label="Fetch current weather"
          onValueChange={(value) => updateSettings({ weatherEnabled: value })}
          subtitle="When enabled, Drively sends approximate coordinates directly to Open-Meteo when you open the drive logger. Turn this off to make no weather API calls."
          value={enabled}
        />
      </SettingsSection>
      <SettingsSection title="Temperature">
        <SettingsChoice
          label="Temperature unit"
          onChange={(value) => updateSettings({ temperatureUnit: value })}
          options={[
            { value: 'imperial', label: 'Fahrenheit' },
            { value: 'metric', label: 'Celsius' },
          ]}
          value={settings.temperatureUnit || 'metric'}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
