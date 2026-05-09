import { NativeModules, Platform } from 'react-native';

const DrivePip = NativeModules.DrivePip;

export function isDrivePipAvailable() {
  return Platform.OS === 'android' && !!DrivePip;
}

export async function isPictureInPictureSupported() {
  if (!isDrivePipAvailable()) return false;
  return DrivePip.isPictureInPictureSupported();
}

export function setDrivePipTrackingActive(active) {
  if (!isDrivePipAvailable()) return;
  DrivePip.setTrackingActive(active);
}

export function updateDrivePipStats({ title, subtitle }) {
  if (!isDrivePipAvailable()) return;
  DrivePip.updateStats({ title, subtitle });
}

export async function enterDrivePictureInPicture() {
  if (!isDrivePipAvailable()) return false;
  return DrivePip.enterPictureInPicture();
}
