import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const UPDATE_ID_KEY = 'sphegatti_update_id';

export type CheckForUpdateOptions = {
  appId: string;
  serverUrl?: string;
  runtimeVersion?: string;
  channel?: string;
};

export type UpdateResult =
  | { status: 'up-to-date' }
  | { status: 'updated'; updateId: string }
  | { status: 'error'; message: string };

export async function checkForUpdate(opts: CheckForUpdateOptions): Promise<UpdateResult> {
  const {
    appId,
    serverUrl = 'https://sphegatti.onrender.com',
    runtimeVersion = '1',
    channel = 'production',
  } = opts;

  try {
    const currentUpdateId = (await AsyncStorage.getItem(UPDATE_ID_KEY)) ?? 'base';

    const params = new URLSearchParams({
      appId,
      platform: 'android',
      runtimeVersion,
      channel,
      currentUpdateId,
    });

    const res = await fetch(`${serverUrl}/updates/check?${params}`);
    if (!res.ok) return { status: 'error', message: `Server error: ${res.status}` };

    const data = (await res.json()) as {
      updateAvailable: boolean;
      updateId?: string;
      bundleUrl?: string;
    };

    if (!data.updateAvailable) return { status: 'up-to-date' };

    const { OtaModule } = NativeModules as {
      OtaModule?: { downloadAndActivate(url: string): Promise<string> };
    };

    if (!OtaModule) {
      return { status: 'error', message: 'OtaModule not found. Did you run npx ota init?' };
    }

    // Save before download — if the process is killed mid-flight, next launch won't retry
    await AsyncStorage.setItem(UPDATE_ID_KEY, data.updateId!);
    await OtaModule.downloadAndActivate(data.bundleUrl!);
    // Native module restarts the app — code below this won't run
    return { status: 'updated', updateId: data.updateId! };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
