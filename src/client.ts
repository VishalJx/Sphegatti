import { NativeModules, DevSettings } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const UPDATE_ID_KEY = 'sphegatti_update_id';

export type OtaStatus = 'checking' | 'up-to-date' | 'updated' | 'error';

export type CheckForUpdateOptions = {
  appId: string;
  serverUrl?: string;
  runtimeVersion?: string;
  channel?: string;
};

export async function checkForUpdate(opts: CheckForUpdateOptions): Promise<OtaStatus> {
  const {
    appId,
    serverUrl = 'https://sphegatti.onrender.com',
    runtimeVersion = '1',
    channel = 'production',
  } = opts;

  const currentUpdateId = (await AsyncStorage.getItem(UPDATE_ID_KEY)) ?? 'base';

  const params = new URLSearchParams({
    appId,
    platform: 'android',
    runtimeVersion,
    channel,
    currentUpdateId,
  });

  const res = await fetch(`${serverUrl}/updates/check?${params}`);
  if (!res.ok) throw new Error(`Server error: ${res.status}`);

  const data = (await res.json()) as {
    updateAvailable: boolean;
    updateId?: string;
    bundleUrl?: string;
  };

  if (!data.updateAvailable) return 'up-to-date';

  const { OtaModule } = NativeModules as {
    OtaModule?: { downloadAndActivate(url: string): Promise<string> };
  };

  if (!OtaModule) throw new Error('OtaModule native module not found. Did you run npx ota init?');

  await OtaModule.downloadAndActivate(data.bundleUrl!);
  await AsyncStorage.setItem(UPDATE_ID_KEY, data.updateId!);
  DevSettings.reload();
  return 'updated';
}

export function useOtaUpdate(opts: CheckForUpdateOptions): OtaStatus {
  const [status, setStatus] = useState<OtaStatus>('checking');

  useEffect(() => {
    checkForUpdate(opts)
      .then(setStatus)
      .catch(() => setStatus('error'));
  // opts intentionally not in deps — called once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return status;
}
