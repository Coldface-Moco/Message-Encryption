import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Copy,
  Shield,
  CheckCircle,
  Key,
  Eye,
  EyeOff,
  Settings,
  X,
  Rocket,
  TrendingDown,
  RefreshCw,
  Info,
} from 'lucide-react-native';
import { encrypt, decrypt } from './src/utils/encryption';
import { useAppUpdater } from './src/hooks/useAppUpdater';
import * as Updates from 'expo-updates';

const CHANGELOG_VERSION = 'v1.1.2';
const CHANGELOG_KEY = `changelog_seen_${CHANGELOG_VERSION}_fix1`;

const CHANGELOG_ITEMS = [
  '修复使用密钥加密/解密完全失败的问题',
  '密钥应用方式改为 XOR 运算，天然 32-bit 封闭无溢出',
  '修复 null 字符（charCode=0）在解密后丢失的问题',
  '新增分隔符与自定义字符冲突校验，防止设置错误导致解密失败',
  '优化 LZW 字典大小限制，防止极端输入导致内存溢出',
];

export default function App() {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [useKey, setUseKey] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showCustomSettings, setShowCustomSettings] = useState(false);

  const [customChars, setCustomChars] = useState(['3', '1', '5', '6', '8', '0', '7', '9']);
  const [customSeparator, setCustomSeparator] = useState('2');
  const [compressionRatio, setCompressionRatio] = useState<number | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const { status: updateStatus, progress: updateProgress, checkForUpdate, autoCheck } = useAppUpdater();

  useEffect(() => {
    AsyncStorage.getItem(CHANGELOG_KEY).then((seen) => {
      if (!seen) setShowChangelog(true);
    });
    const timer = setTimeout(() => {
      autoCheck();
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const dismissChangelog = useCallback(async () => {
    await AsyncStorage.setItem(CHANGELOG_KEY, '1');
    setShowChangelog(false);
  }, []);

  const handleEncrypt = useCallback(() => {
    if (useKey && !encryptionKey.trim()) {
      Alert.alert('提示', '请输入密钥');
      return;
    }
    try {
      const { result, ratio } = encrypt(inputText, {
        customChars,
        customSeparator,
        useKey,
        key: useKey ? encryptionKey : undefined,
      });
      setOutputText(result);
      setCompressionRatio(ratio);
    } catch {
      Alert.alert('加密失败', '请检查输入内容或自定义字符设置');
    }
  }, [inputText, customChars, customSeparator, useKey, encryptionKey]);

  const handleDecrypt = useCallback(() => {
    if (useKey && !encryptionKey.trim()) {
      Alert.alert('提示', '请输入密钥');
      return;
    }
    try {
      const result = decrypt(inputText, {
        customChars,
        customSeparator,
        useKey,
        key: useKey ? encryptionKey : undefined,
      });
      setOutputText(result);
      setCompressionRatio(null);
    } catch {
      Alert.alert('解密失败', '请确认密文格式正确，且密钥与加密时一致');
    }
  }, [inputText, customChars, customSeparator, useKey, encryptionKey]);

  const copyToClipboard = useCallback(async () => {
    if (!outputText) return;
    await Clipboard.setStringAsync(outputText);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }, [outputText]);

  const clearInputText = useCallback(() => {
    setInputText('');
    setOutputText('');
    setCompressionRatio(null);
  }, []);

  const resetToDefault = useCallback(() => {
    setCustomChars(['3', '1', '5', '6', '8', '0', '7', '9']);
    setCustomSeparator('2');
  }, []);

  const updateCustomChar = useCallback((index: number, value: string) => {
    const ch = value.slice(0, 1);
    if (!ch) return;
    setCustomChars((prev) => {
      // 若其他位置已有该字符或与分隔符冲突，则忽略本次更新
      if (prev.some((c, i) => i !== index && c === ch) || ch === customSeparator) return prev;
      const newChars = [...prev];
      newChars[index] = ch;
      return newChars;
    });
  }, [customSeparator]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* 更新日志弹窗 */}
      <Modal
        visible={showChangelog}
        transparent
        animationType="fade"
        onRequestClose={dismissChangelog}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconRow}>
                <Rocket size={20} color="#3b82f6" />
                <Text style={styles.modalTitle}>版本更新 {CHANGELOG_VERSION}</Text>
              </View>
              <TouchableOpacity onPress={dismissChangelog} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={20} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>本次更新内容</Text>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={true}>
              {CHANGELOG_ITEMS.map((item, i) => (
                <View key={i} style={styles.changelogItem}>
                  <View style={styles.changelogDot} />
                  <Text style={styles.changelogText}>{item}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalBtn} onPress={dismissChangelog}>
              <Text style={styles.modalBtnText}>我知道了</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 关于弹窗 */}
      <Modal
        visible={showAbout}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAbout(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconRow}>
                <Info size={20} color="#3b82f6" />
                <Text style={styles.modalTitle}>关于 {CHANGELOG_VERSION}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAbout(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={20} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
              <Text style={styles.modalSubtitle}>更新内容</Text>
              {CHANGELOG_ITEMS.map((item, i) => (
                <View key={i} style={styles.changelogItem}>
                  <View style={styles.changelogDot} />
                  <Text style={styles.changelogText}>{item}</Text>
                </View>
              ))}
              <View style={[styles.changelogItem, { marginTop: 12 }]}>
                <View style={styles.changelogDot} />
                <Text style={styles.changelogText}>关于本项目：</Text>
              </View>
              <TouchableOpacity onPress={() => Linking.openURL('https://github.com/Coldface-Moco/Message-Encryption')}>
                <Text style={[styles.changelogText, { color: '#3b82f6', textDecorationLine: 'underline', marginLeft: 20 }]}>
                  https://github.com/Coldface-Moco/Message-Encryption
                </Text>
              </TouchableOpacity>
            </ScrollView>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setShowAbout(false)}>
              <Text style={styles.modalBtnText}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* 标题区域 */}
          <View style={styles.header}>
            <View style={styles.headerIconRow}>
              <View style={styles.iconCircle}>
                <Shield size={28} color="#fff" />
              </View>
              <Text style={styles.headerTitle}>Message Encryption</Text>
            </View>
            <Text style={styles.headerSubtitle}>您的消息助手！</Text>
          </View>

          {/* 自定义设置区域 */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <Settings size={18} color="#374151" />
                <Text style={styles.cardTitle}>自定义设置</Text>
              </View>
              <TouchableOpacity
                style={styles.toggleBtn}
                onPress={() => setShowCustomSettings(!showCustomSettings)}
              >
                <Text style={styles.toggleBtnText}>
                  {showCustomSettings ? '收起' : '展开'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.cardDesc}>
              自定义密文字符和分隔符，让你的加密更个性化
            </Text>

            {showCustomSettings && (
              <View style={styles.settingsBody}>
                <Text style={styles.settingsLabel}>
                  密文字符设置（当前使用 {customChars.length} 个字符）
                </Text>
                <View style={styles.charGrid}>
                  {customChars.map((char, index) => (
                    <View key={index} style={styles.charInputWrap}>
                      <Text style={styles.charLabel}>字符 {index + 1}</Text>
                      <TextInput
                        style={styles.charInput}
                        value={char}
                        onChangeText={(v) => updateCustomChar(index, v)}
                        maxLength={1}
                        textAlign="center"
                      />
                    </View>
                  ))}
                </View>

                <Text style={styles.settingsLabel}>分隔符</Text>
                <TextInput
                  style={styles.separatorInput}
                  value={customSeparator}
                  onChangeText={(v) => {
                    const ch = v.slice(0, 1);
                    if (!ch) return;
                    // 分隔符不能与自定义字符重复
                    if (customChars.includes(ch)) return;
                    setCustomSeparator(ch);
                  }}
                  maxLength={1}
                  textAlign="center"
                />

                <View style={styles.settingsFooter}>
                  <Text style={styles.previewText}>
                    预览: {customChars.join('')} (分隔符: {customSeparator})
                  </Text>
                  <TouchableOpacity
                    style={styles.resetBtn}
                    onPress={resetToDefault}
                  >
                    <Text style={styles.resetBtnText}>恢复默认</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* 主要功能区域 */}
          <View style={styles.card}>
            <View style={styles.cardHeaderCenter}>
              <Text style={styles.cardTitle}>文本处理</Text>
              <Text style={styles.cardDesc}>
                输入明文或密文，选择对应操作进行加密或解密
              </Text>
            </View>

            {/* 密钥选项 */}
            <View style={styles.section}>
              <View style={styles.switchRow}>
                <Switch
                  value={useKey}
                  onValueChange={setUseKey}
                  trackColor={{ false: '#d1d5db', true: '#3b82f6' }}
                  thumbColor="#fff"
                />
                <View style={styles.switchLabelRow}>
                  <Key size={16} color="#374151" />
                  <Text style={styles.switchLabel}>使用密钥加强安全性</Text>
                </View>
              </View>

              {useKey && (
                <View style={styles.keyInputWrap}>
                  <Text style={styles.label}>密钥</Text>
                  <View style={styles.passwordWrap}>
                    <TextInput
                      style={styles.passwordInput}
                      value={encryptionKey}
                      onChangeText={setEncryptionKey}
                      placeholder="请输入密钥（双方必须使用相同密钥）"
                      secureTextEntry={!showKey}
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowKey(!showKey)}
                    >
                      {showKey ? (
                        <EyeOff size={18} color="#9ca3af" />
                      ) : (
                        <Eye size={18} color="#9ca3af" />
                      )}
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.hintText}>
                    {encryptionKey.length > 0 ? '密钥已设置' : '未输入密钥'}
                  </Text>
                </View>
              )}
            </View>

            {/* 输入区域 */}
            <View style={styles.section}>
              <View style={styles.inputHeader}>
                <Text style={styles.label}>输入内容</Text>
                {inputText.length > 0 && (
                  <TouchableOpacity
                    style={styles.clearBtn}
                    onPress={clearInputText}
                  >
                    <X size={14} color="#ef4444" />
                    <Text style={styles.clearBtnText}>清除</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.textArea}
                value={inputText}
                onChangeText={setInputText}
                placeholder="请输入要处理的文本..."
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
              <Text style={styles.countText}>字符数: {inputText.length}</Text>
            </View>

            {/* 操作按钮 */}
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  styles.encryptBtn,
                  (!inputText || (useKey && !encryptionKey.trim())) &&
                    styles.disabledBtn,
                ]}
                onPress={handleEncrypt}
                disabled={!inputText || (useKey && !encryptionKey.trim())}
              >
                <Text style={styles.actionBtnText}>加密</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  styles.decryptBtn,
                  (!inputText || (useKey && !encryptionKey.trim())) &&
                    styles.disabledBtn,
                ]}
                onPress={handleDecrypt}
                disabled={!inputText || (useKey && !encryptionKey.trim())}
              >
                <Text style={styles.actionBtnText}>解密</Text>
              </TouchableOpacity>
            </View>

            {/* 输出区域 */}
            {outputText.length > 0 && (
              <View style={styles.section}>
                <View style={styles.inputHeader}>
                  <Text style={styles.label}>处理结果</Text>
                  <TouchableOpacity
                    style={styles.copyBtn}
                    onPress={copyToClipboard}
                  >
                    {copySuccess ? (
                      <>
                        <CheckCircle size={14} color="#22c55e" />
                        <Text style={styles.copyBtnSuccess}>已复制</Text>
                      </>
                    ) : (
                      <>
                        <Copy size={14} color="#374151" />
                        <Text style={styles.copyBtnText}>复制</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[styles.textArea, styles.outputArea]}
                  value={outputText}
                  multiline
                  numberOfLines={5}
                  editable={false}
                  textAlignVertical="top"
                  scrollEnabled
                />
                <View style={styles.outputMeta}>
                  {compressionRatio !== null ? (
                    <View style={[styles.compressionRow, compressionRatio > 0 ? styles.compressionGood : compressionRatio < 0 ? styles.compressionBad : styles.compressionNeutral]}>
                      <TrendingDown size={12} color={compressionRatio > 0 ? '#16a34a' : compressionRatio < 0 ? '#f97316' : '#9ca3af'} />
                      <Text style={[styles.compressionText, compressionRatio > 0 ? styles.compressionGood : compressionRatio < 0 ? styles.compressionBad : styles.compressionNeutral]}>
                        {compressionRatio > 0
                          ? `压缩率 ${compressionRatio}%`
                          : compressionRatio < 0
                          ? `压缩率 -${Math.abs(compressionRatio)}%（内容无规律）`
                          : '压缩率 0%'}
                      </Text>
                    </View>
                  ) : <View />}
                  <Text style={styles.countText}>字符数: {outputText.length}</Text>
                </View>
              </View>
            )}
          </View>

          {/* 说明区域 */}
          <View style={styles.card}>
            <View style={styles.cardHeaderCenter}>
              <Text style={styles.cardTitle}>使用说明</Text>
            </View>
            <View style={styles.helpList}>
              {[
                { color: '#22c55e', text: '加密：将普通文本转换为由自定义字符组成的密文，使用自定义分隔符连接' },
                { color: '#3b82f6', text: '解密：将自定义密文还原为原始文本内容' },
                { color: '#a855f7', text: '密钥功能：启用密钥后，双方必须使用相同的密钥才能正确加密和解密' },
                { color: '#f97316', text: '自定义设置：可以自定义密文字符和分隔符，让加密更个性化' },
                { color: '#ef4444', text: '特点：支持中英文混合文本，采用可逆加密算法，确保信息无损失' },
              ].map((item, idx) => (
                <View key={idx} style={styles.helpItem}>
                  <View
                    style={[styles.helpDot, { backgroundColor: item.color }]}
                  />
                  <Text style={styles.helpText}>{item.text}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* 页脚 */}
          <View style={styles.footerRow}>
            <Text style={styles.footer}>@2026 Build V1.1.2 版权所有</Text>
            <TouchableOpacity
              style={styles.updateBtn}
              onPress={checkForUpdate}
              disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
            >
              {updateStatus === 'checking' || updateStatus === 'downloading' ? (
                <ActivityIndicator size={12} color="#6b7280" />
              ) : (
                <RefreshCw size={12} color="#6b7280" />
              )}
              <Text style={styles.updateBtnText}>
                {updateStatus === 'checking'
                  ? '检查中…'
                  : updateStatus === 'downloading'
                  ? updateProgress || '下载中…'
                  : '检查更新'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.updateBtn}
              onPress={() => setShowAbout(true)}
            >
              <Info size={12} color="#6b7280" />
              <Text style={styles.updateBtnText}>关于</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eff6ff',
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  headerIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e40af',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderCenter: {
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginLeft: 6,
  },
  cardDesc: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  toggleBtnText: {
    fontSize: 13,
    color: '#374151',
  },
  settingsBody: {
    marginTop: 12,
  },
  settingsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  charGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  charInputWrap: {
    width: '22%',
    marginBottom: 8,
  },
  charLabel: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 4,
    textAlign: 'center',
  },
  charInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 8,
    fontSize: 16,
    backgroundColor: '#f9fafb',
    color: '#111827',
  },
  separatorInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#f9fafb',
    color: '#111827',
    width: 60,
  },
  settingsFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  previewText: {
    fontSize: 13,
    color: '#6b7280',
  },
  resetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  resetBtnText: {
    fontSize: 13,
    color: '#374151',
  },
  section: {
    marginTop: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  switchLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  switchLabel: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 4,
  },
  keyInputWrap: {
    marginTop: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    paddingRight: 10,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111827',
  },
  eyeBtn: {
    padding: 6,
  },
  hintText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  inputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  clearBtnText: {
    fontSize: 12,
    color: '#ef4444',
    marginLeft: 2,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#f9fafb',
    color: '#111827',
    minHeight: 120,
    lineHeight: 20,
  },
  outputArea: {
    backgroundColor: '#f3f4f6',
    maxHeight: 300,
  },
  countText: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'right',
    marginTop: 4,
  },
  outputMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  compressionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compressionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  compressionGood: {
    color: '#16a34a',
  },
  compressionBad: {
    color: '#f97316',
  },
  compressionNeutral: {
    color: '#9ca3af',
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 20,
  },
  actionBtn: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 120,
    alignItems: 'center',
  },
  encryptBtn: {
    backgroundColor: '#22c55e',
  },
  decryptBtn: {
    backgroundColor: '#3b82f6',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  copyBtnText: {
    fontSize: 12,
    color: '#374151',
    marginLeft: 4,
  },
  copyBtnSuccess: {
    fontSize: 12,
    color: '#22c55e',
    marginLeft: 4,
  },
  helpList: {
    marginTop: 8,
  },
  helpItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  helpDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    marginRight: 10,
  },
  helpText: {
    flex: 1,
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 8,
    marginBottom: 16,
  },
  footerRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  updateBtnText: {
    fontSize: 11,
    color: '#6b7280',
  },
  // 更新日志弹窗
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e3a5f',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
  },
  changelogItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  changelogDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
    marginTop: 5,
    flexShrink: 0,
  },
  changelogText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
  },
  modalBtn: {
    marginTop: 20,
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
