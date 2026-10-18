import { NativeModules } from 'react-native';

const TAG = '[Sphegatti]';

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
    const { OtaModule } = NativeModules as {
      OtaModule?: {
        downloadAndActivate(url: string): Promise<string>;
        getUpdateId(): Promise<string>;
        setUpdateId(id: string): Promise<void>;
      };
    };

    if (!OtaModule) {
      console.log(`${TAG} OtaModule not found`);
      return { status: 'error', message: 'OtaModule not found. Did you run npx ota init?' };
    }

    const currentUpdateId = await OtaModule.getUpdateId();
    console.log(`${TAG} checking — currentUpdateId: ${currentUpdateId}`);

    const params = new URLSearchParams({
      appId,
      platform: 'android',
      runtimeVersion,
      channel,
      currentUpdateId,
    });

    const res = await fetch(`${serverUrl}/updates/check?${params}`);
    if (!res.ok) {
      console.log(`${TAG} server error: ${res.status}`);
      return { status: 'error', message: `Server error: ${res.status}` };
    }

    const data = (await res.json()) as {
      updateAvailable: boolean;
      updateId?: string;
      bundleUrl?: string;
    };
    console.log(`${TAG} server response:`, JSON.stringify(data));

    if (!data.updateAvailable) return { status: 'up-to-date' };

    console.log(`${TAG} downloading: ${data.bundleUrl}`);
    const nativeResult = await OtaModule.downloadAndActivate(data.bundleUrl!);
    console.log(`${TAG} native result: ${nativeResult}`);

    await OtaModule.setUpdateId(data.updateId!);
    console.log(`${TAG} saved updateId: ${data.updateId}`);
    return { status: 'updated', updateId: data.updateId! };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.log(`${TAG} error: ${message}`);
    return { status: 'error', message };
  }
}
