import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import * as Updates from 'expo-updates';

export type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'error' | 'latest';

export interface AppUpdaterState {
  status: UpdateStatus;
  progress: string;
  checkForUpdate: () => Promise<void>;
}

/**
 * useAppUpdater — 封装 Expo OTA 更新完整流程
 *
 * 流程：检查 → 下载 → 提示重启
 * 开发模式下 Updates.isEnabled = false，流程会跳过但不报错
 */
export function useAppUpdater(): AppUpdaterState {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [progress, setProgress] = useState('');

  const checkForUpdate = useCallback(async () => {
    if (!Updates.isEnabled) {
      Alert.alert('提示', '当前为开发模式，在线更新功能仅在正式包中生效。');
      return;
    }

    try {
      setStatus('checking');
      setProgress('正在检查更新…');

      const result = await Updates.checkForUpdateAsync();

      if (!result.isAvailable) {
        setStatus('latest');
        setProgress('');
        Alert.alert('已是最新版本', '当前应用已是最新版本，无需更新。');
        return;
      }

      // 有新版本 — 询问用户
      Alert.alert(
        '发现新版本',
        '检测到新版本可用，是否立即下载并更新？',
        [
          { text: '稍后再说', style: 'cancel', onPress: () => { setStatus('idle'); setProgress(''); } },
          {
            text: '立即更新',
            onPress: async () => {
              try {
                setStatus('downloading');
                setProgress('正在下载更新…');
                await Updates.fetchUpdateAsync();
                setStatus('ready');
                setProgress('');
                Alert.alert(
                  '更新完成',
                  '新版本已下载完成，重启应用后生效。',
                  [
                    { text: '稍后重启', style: 'cancel' },
                    {
                      text: '立即重启',
                      onPress: async () => {
                        await Updates.reloadAsync();
                      },
                    },
                  ],
                );
              } catch {
                setStatus('error');
                setProgress('');
                Alert.alert('下载失败', '更新下载失败，请检查网络后重试。');
              }
            },
          },
        ],
      );
    } catch {
      setStatus('error');
      setProgress('');
      Alert.alert('检查失败', '无法连接更新服务器，请检查网络后重试。');
    }
  }, []);

  return { status, progress, checkForUpdate };
}
