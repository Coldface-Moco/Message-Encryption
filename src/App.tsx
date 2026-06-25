import { useState, useEffect, useCallback } from 'react';
import { Copy, Shield, CheckCircle, Key, Eye, EyeOff, Settings, X, TrendingDown, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const RLE_MARKER = 131072;

const CHANGELOG_VERSION = 'v1.1.2';
const CHANGELOG_KEY = `changelog_seen_${CHANGELOG_VERSION}`;

const CHANGELOG_ITEMS = [
  '编码方案升级为 BigInt 打包，移除 LZW 压缩，输出缩短 20-60%',
  '修复密钥加密解密失败：XOR 运算后加 >>> 0 转回无符号 32-bit',
  '修复 null 字符（charCode=0）丢失问题',
  '修复分隔符与自定义字符冲突导致解密失败',
  '升级密钥算法：密钥空间 ≈ keyLen × 2³²',
];

function App() {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [useKey, setUseKey] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showCustomSettings, setShowCustomSettings] = useState(false);
  const [compressionRatio, setCompressionRatio] = useState<number | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(CHANGELOG_KEY)) setShowChangelog(true);
  }, []);

  const dismissChangelog = useCallback(() => {
    localStorage.setItem(CHANGELOG_KEY, '1');
    setShowChangelog(false);
  }, []);

  // 自定义密文字符和分隔符
  const [customChars, setCustomChars] = useState(['3', '1', '5', '6', '8', '0', '7', '9']);
  const [customSeparator, setCustomSeparator] = useState('2');

  // Zigzag 编码：将任意整数（含负数）双射到非负整数
  const zigzag = (n: number): number => n >= 0 ? n * 2 : -n * 2 - 1;
  const unzigzag = (n: number): number => n % 2 === 0 ? n / 2 : -(n + 1) / 2;

  // 将整数码序列编码为自定义字符串（BigInt 打包方案）
  // 格式：[2字符头: bitsPerValue] [base-N 编码的打包数据]
  const codesToStr = (codes: number[], chars: string[]): string => {
    if (!codes.length) return '';
    const base = chars.length;
    const zigzags = codes.map(val => BigInt(zigzag(val)));
    const maxZ = zigzags.reduce((m, z) => z > m ? z : m, 0n);
    const bpv = maxZ === 0n ? 1 : maxZ.toString(2).length;
    const bpvIdx = bpv - 1;
    const header = chars[Math.floor(bpvIdx / base)] + chars[bpvIdx % base];
    let packed = 0n;
    for (const z of zigzags) packed = (packed << BigInt(bpv)) | z;
    if (packed === 0n) {
      const expectedLen = Math.ceil(codes.length * bpv / Math.log2(base));
      return header + chars[0].repeat(expectedLen);
    }
    let encoded = '';
    while (packed > 0n) {
      encoded = chars[Number(packed % BigInt(base))] + encoded;
      packed /= BigInt(base);
    }
    const expectedLen = Math.ceil(codes.length * bpv / Math.log2(base));
    while (encoded.length < expectedLen) encoded = chars[0] + encoded;
    return header + encoded;
  };

  // 将自定义字符串解码为整数码序列
  const strToCodes = (text: string, chars: string[]): number[] => {
    if (text.length < 2) return [];
    const base = chars.length;
    const h0 = chars.indexOf(text[0]);
    const h1 = chars.indexOf(text[1]);
    if (h0 === -1 || h1 === -1) return [];
    const bpv = h0 * base + h1 + 1;
    if (bpv <= 0) return [];
    const data = text.slice(2);
    if (!data.length) return [];
    let packed = 0n;
    for (const ch of data) {
      const idx = chars.indexOf(ch);
      if (idx === -1) return [];
      packed = packed * BigInt(base) + BigInt(idx);
    }
    const totalBits = Math.floor(data.length * Math.log2(base));
    const count = Math.floor(totalBits / bpv);
    if (count <= 0) return [];
    const mask = (1n << BigInt(bpv)) - 1n;
    const codes: number[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const z = Number((packed >> (BigInt(i) * BigInt(bpv))) & mask);
      codes.push(unzigzag(z));
    }
    return codes;
  };

  // RLE 编码：连续3+相同值压缩
  const rleEncode = (arr: number[]): number[] => {
    const out: number[] = [];
    let i = 0;
    while (i < arr.length) {
      const v = arr[i];
      let run = 1;
      while (i + run < arr.length && arr[i + run] === v && run < 255) run++;
      if (run >= 3) { out.push(RLE_MARKER, v, run); i += run; }
      else { out.push(v); i++; }
    }
    return out;
  };

  // RLE 解码
  const rleDecode = (arr: number[]): number[] => {
    const out: number[] = [];
    let i = 0;
    while (i < arr.length) {
      if (arr[i] === RLE_MARKER) {
        const v = arr[i + 1], count = arr[i + 2];
        for (let k = 0; k < count; k++) out.push(v);
        i += 3;
      } else { out.push(arr[i]); i++; }
    }
    return out;
  };

  // 按位置派生密钥流
  const getKeyOffsets = (key: string, length: number): number[] => {
    const offsets: number[] = [];
    let state = 0x12345678;
    for (let i = 0; i < length; i++) {
      const kc = key.charCodeAt(i % key.length);
      state = (Math.imul(state ^ kc, 0x9e3779b9) >>> 0);
      state = (((state << 13) | (state >>> 19)) ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0;
      offsets.push(state);
    }
    return offsets;
  };

  // 加密：RLE压缩 → XOR加密 → BigInt打包
  const encrypt = (text: string, key?: string): { result: string; ratio: number } => {
    if (!text) return { result: '', ratio: 0 };
    const chars = customChars;
    const plainCodes: number[] = [];
    for (let i = 0; i < text.length; i++) plainCodes.push(text.charCodeAt(i));
    const uncompressedLen = codesToStr(plainCodes, chars).length;
    const rled = rleEncode(plainCodes);
    const keyOffsets = useKey && key ? getKeyOffsets(key, rled.length) : null;
    const adjusted = rled.map((v, i) => keyOffsets ? (v ^ keyOffsets[i]) >>> 0 : v);
    const xored: number[] = [adjusted[0]];
    for (let i = 1; i < adjusted.length; i++) xored.push(adjusted[i] ^ adjusted[i - 1]);
    const result = codesToStr(xored, chars);
    const ratio = uncompressedLen > 0
      ? Math.round((1 - result.length / uncompressedLen) * 100)
      : 0;
    return { result, ratio };
  };

  // 解密：自定义字符解码 → 逆XOR → RLE解压 → 原文
  const decrypt = (text: string, key?: string): string => {
    if (!text) return '';
    const chars = customChars;
    const xored = strToCodes(text, chars);
    if (!xored.length) return '';
    const adjusted: number[] = [xored[0]];
    for (let i = 1; i < xored.length; i++) adjusted.push(xored[i] ^ adjusted[i - 1]);
    const keyOffsets = useKey && key ? getKeyOffsets(key, adjusted.length) : null;
    const rled = adjusted.map((v, i) => keyOffsets ? (v ^ keyOffsets[i]) >>> 0 : v);
    const plainCodes = rleDecode(rled);
    return plainCodes.map(c => String.fromCharCode(c)).join('');
  };

  // 处理加密
  const handleEncrypt = () => {
    if (useKey && !encryptionKey.trim()) {
      alert('请输入密钥');
      return;
    }
    try {
      const { result, ratio } = encrypt(inputText, useKey ? encryptionKey : undefined);
      setOutputText(result);
      setCompressionRatio(ratio);
    } catch {
      alert('加密失败，请检查输入内容或自定义字符设置');
    }
  };

  // 处理解密
  const handleDecrypt = () => {
    if (useKey && !encryptionKey.trim()) {
      alert('请输入密钥');
      return;
    }
    try {
      setOutputText(decrypt(inputText, useKey ? encryptionKey : undefined));
      setCompressionRatio(null);
    } catch {
      alert('解密失败，请确认密文格式正确，且密钥与加密时一致');
    }
  };

  // 复制到剪贴板
  const copyToClipboard = async () => {
    if (!outputText) return;
    
    try {
      await navigator.clipboard.writeText(outputText);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 重置为默认设置
  const resetToDefault = () => {
    setCustomChars(['3', '1', '5', '6', '8', '0', '7', '9']);
    setCustomSeparator('2');
  };

  // 更新自定义字符（拒绝重复字符 & 与分隔符冲突，保证 base 编码双射性）
  const updateCustomChar = (index: number, value: string) => {
    const ch = value.slice(0, 1);
    if (!ch) return;
    if (customChars.some((c, i) => i !== index && c === ch)) return; // 字符间重复
    if (ch === customSeparator) return; // 与分隔符冲突
    const newChars = [...customChars];
    newChars[index] = ch;
    setCustomChars(newChars);
  };

  // 更新分隔符（拒绝与自定义字符冲突）
  const updateSeparator = (value: string) => {
    const ch = value.slice(0, 1);
    if (!ch) return;
    if (customChars.includes(ch)) return; // 与自定义字符冲突
    setCustomSeparator(ch);
  };

  // 清除输入内容
  const clearInputText = () => {
    setInputText('');
    setOutputText('');
    setCompressionRatio(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      {/* 更新日志弹窗 */}
      {showChangelog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Rocket className="w-5 h-5 text-blue-500" />
                <span className="text-lg font-bold text-[#1e3a5f]">版本更新 {CHANGELOG_VERSION}</span>
              </div>
              <button onClick={dismissChangelog} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-3">本次更新内容</p>
            <ul className="space-y-2 mb-6">
              {CHANGELOG_ITEMS.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <button
              onClick={dismissChangelog}
              className="w-full py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition-colors"
            >
              我知道了
            </button>
          </div>
        </div>
      )}
      <div className="max-w-2xl mx-auto space-y-8">
        {/* 标题区域 */}
        <div className="text-center space-y-4 py-8">
          <div className="flex items-center justify-center space-x-3">
            <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent text-[24px]">Message Encryption</h1>
          </div>
          <p className="text-lg text-gray-600">{"您的消息助手！"}</p>
        </div>

        {/* 自定义设置区域 */}
        <Card className="shadow-lg border-0 bg-white/70 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <Settings className="w-5 h-5" />
                <span>自定义设置</span>
              </CardTitle>
              <Button
                onClick={() => setShowCustomSettings(!showCustomSettings)}
                variant="outline"
                size="sm"
              >
                {showCustomSettings ? '收起' : '展开'}
              </Button>
            </div>
            <CardDescription>
              自定义密文字符和分隔符，让你的加密更个性化
            </CardDescription>
          </CardHeader>
          {showCustomSettings && (
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-3 block">密文字符设置（当前使用 {customChars.length} 个字符）</Label>
                  <div className="grid grid-cols-4 gap-3">
                    {customChars.map((char, index) => (
                      <div key={index} className="space-y-1">
                        <Label className="text-xs text-gray-500">字符 {index + 1}</Label>
                        <input
                          type="text"
                          value={char}
                          onChange={(e) => updateCustomChar(index, e.target.value)}
                          maxLength={1}
                          className="w-full px-3 py-2 text-center border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
                          placeholder="字符"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="separator">分隔符</Label>
                  <input
                    type="text"
                    id="separator"
                    value={customSeparator}
                    onChange={(e) => updateSeparator(e.target.value)}
                    maxLength={1}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
                    placeholder="分隔符"
                  />
                </div>

                <div className="flex justify-between items-center pt-4">
                  <div className="text-sm text-gray-600">
                    预览: {customChars.join('')} (分隔符: {customSeparator})
                  </div>
                  <Button
                    onClick={resetToDefault}
                    variant="outline"
                    size="sm"
                  >
                    恢复默认
                  </Button>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* 主要功能区域 */}
        <Card className="shadow-lg border-0 bg-white/70 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-center">文本处理</CardTitle>
            <CardDescription className="text-center">
              输入明文或密文，选择对应操作进行加密或解密
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 密钥选项 */}
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="use-key"
                  checked={useKey}
                  onChange={(e) => setUseKey(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
                <Label htmlFor="use-key" className="flex items-center space-x-2 cursor-pointer">
                  <Key className="w-4 h-4" />
                  <span>使用密钥加强安全性</span>
                </Label>
              </div>

              {useKey && (
                <div className="space-y-2">
                  <Label htmlFor="encryption-key">密钥</Label>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      id="encryption-key"
                      value={encryptionKey}
                      onChange={(e) => setEncryptionKey(e.target.value)}
                      placeholder="请输入密钥（双方必须使用相同密钥）"
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="text-xs text-gray-500">
                    {encryptionKey.length > 0 ? '密钥已设置' : '未输入密钥'}
                  </div>
                </div>
              )}
            </div>

            {/* 输入区域 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="input-text">输入内容</Label>
                {inputText && (
                  <Button
                    onClick={clearInputText}
                    variant="outline"
                    size="sm"
                    className="transition-all duration-300 hover:bg-red-50 hover:border-red-300 hover:text-red-600"
                  >
                    <X className="w-4 h-4 mr-1" />
                    清除
                  </Button>
                )}
              </div>
              <Textarea
                id="input-text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="请输入要处理的文本..."
                className="min-h-[150px] resize-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
              />
              <div className="text-xs text-gray-500 text-right">
                字符数: {inputText.length}
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex justify-center space-x-4">
              <Button
                onClick={handleEncrypt}
                disabled={!inputText || (useKey && !encryptionKey.trim())}
                className="px-8 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white transition-all duration-300"
              >
                加密
              </Button>
              <Button
                onClick={handleDecrypt}
                disabled={!inputText || (useKey && !encryptionKey.trim())}
                className="px-8 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white transition-all duration-300"
              >
                解密
              </Button>
            </div>

            {/* 输出区域 */}
            {outputText && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="output-text">处理结果</Label>
                  <Button
                    onClick={copyToClipboard}
                    variant="outline"
                    size="sm"
                    className="transition-all duration-300 hover:bg-blue-50"
                  >
                    {copySuccess ? (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        复制
                      </>
                    )}
                  </Button>
                </div>
                <Textarea
                  id="output-text"
                  value={outputText}
                  readOnly
                  className="min-h-[150px] resize-none bg-gray-50 focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                />
                <div className="flex items-center justify-between text-xs text-gray-500">
                  {compressionRatio !== null && (
                    <div className={`flex items-center space-x-1 font-medium ${compressionRatio > 0 ? 'text-green-600' : compressionRatio < 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                      <TrendingDown className="w-3 h-3" />
                      <span>
                        {compressionRatio > 0
                          ? `压缩率 ${compressionRatio}%`
                          : compressionRatio < 0
                          ? `压缩率 -${Math.abs(compressionRatio)}%（内容无规律）`
                          : '压缩率 0%'}
                      </span>
                    </div>
                  )}
                  {compressionRatio === null && <span />}
                  <span>字符数: {outputText.length}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 说明区域 */}
        <Card className="shadow-lg border-0 bg-white/70 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-center">使用说明</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm text-gray-600">
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                <div>
                  <strong>加密：</strong>将普通文本转换为由自定义字符组成的密文，使用自定义分隔符连接
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                <div>
                  <strong>解密：</strong>将自定义密文还原为原始文本内容
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-purple-500 rounded-full mt-2"></div>
                <div>
                  <strong>密钥功能：</strong>启用密钥后，双方必须使用相同的密钥才能正确加密和解密
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-orange-500 rounded-full mt-2"></div>
                <div>
                  <strong>自定义设置：</strong>可以自定义密文字符和分隔符，让加密更个性化
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-red-500 rounded-full mt-2"></div>
                <div>
                  <strong>特点：</strong>支持中英文混合文本，采用可逆加密算法，确保信息无损失
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 页脚 */}
        <div className="text-center py-6">
          <p className="text-sm text-gray-500">{"@2026 Build V1.1.2 版权所有"}</p>
        </div>
      </div>
    </div>
  );
}

export default App;