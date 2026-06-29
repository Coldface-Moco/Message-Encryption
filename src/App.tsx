import { useState, useEffect, useCallback } from 'react';
import { Copy, Shield, CheckCircle, Key, Eye, EyeOff, Settings, X, TrendingDown, Rocket, ClipboardPaste } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

// RLE 标记：高于最大 XOR 值（charCode+keyOffset+i 最大约 131000），使用 131072
const RLE_MARKER = 131072;
// LZW 字典码起点：高于 RLE_MARKER
const LZW_BASE = 262144;
const LZW_DICT_MAX = 524288; // 字典最多 262144 个条目，防止极端输入撑爆内存

const CHANGELOG_VERSION = 'v1.1.2';
const CHANGELOG_KEY = `changelog_seen_${CHANGELOG_VERSION}_fix5`;

const CHANGELOG_ITEMS = [
  '输入框新增粘贴按钮：清除内容后显示，一键粘贴剪贴板内容',
];

const CHANGELOG_PREVIOUS: { version: string; items: string[] }[] = [
  {
    version: 'v1.1.2',
    items: [
      '优化界面排版：自定义设置移至文本处理框下方，操作更便捷',
      '修复使用密钥加密/解密完全失败的问题',
      '密钥应用方式改为 XOR 运算，天然 32-bit 封闭无溢出',
      '修复 null 字符（charCode=0）在解密后丢失的问题',
      '新增分隔符与自定义字符冲突校验，防止设置错误导致解密失败',
      '优化 LZW 字典大小限制，防止极端输入导致内存溢出',
    ],
  },
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
  const [showPreviousChangelog, setShowPreviousChangelog] = useState(false);

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

  // Zigzag 编码：将任意整数（含负数）双射到非负整数，避免 toString() 输出 "-" 号
  const zigzag = (n: number): number => n >= 0 ? n * 2 : -n * 2 - 1;
  const unzigzag = (n: number): number => n % 2 === 0 ? n / 2 : -(n + 1) / 2;

  // 将整数码序列编码为自定义字符串（无最小填充，变长编码，负数安全）
  const codesToStr = (codes: number[], chars: string[], sep: string): string => {
    const base = chars.length;
    return codes.map(val => {
      const s = zigzag(val).toString(base);
      return [...s].map(d => chars[parseInt(d, base)]).join('');
    }).join(sep);
  };

  // 将自定义字符串解码为整数码序列（逐字符累加，避免 parseInt 长串溢出）
  const strToCodes = (text: string, chars: string[], sep: string): number[] => {
    const base = chars.length;
    return text.split(sep).filter(Boolean).map(group => {
      let val = 0;
      for (const ch of group) {
        const idx = chars.indexOf(ch);
        if (idx !== -1) val = val * base + idx;
      }
      return unzigzag(val);
    });
  };

  // RLE 编码：对整数流做游程压缩（连续3+相同值）
  const rleEncode = (arr: number[]): number[] => {
    const out: number[] = [];
    let i = 0;
    while (i < arr.length) {
      const v = arr[i];
      let run = 1;
      while (i + run < arr.length && arr[i + run] === v && run < 255) run++;
      if (run >= 3) {
        out.push(RLE_MARKER, v, run);
        i += run;
      } else {
        out.push(v);
        i++;
      }
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
      } else {
        out.push(arr[i]);
        i++;
      }
    }
    return out;
  };

  // LZW 压缩：整数数组 → 整数数组
  const lzwCompressInts = (arr: number[]): number[] => {
    const dict = new Map<string, number>();
    let dictSize = LZW_BASE;
    const result: number[] = [];
    let w: number[] = [];
    for (const v of arr) {
      const wv = [...w, v];
      const key = wv.join(',');
      if (w.length === 0 || dict.has(key)) {
        w = wv;
      } else {
        result.push(w.length === 1 ? w[0] : dict.get(w.join(','))!);
        if (dictSize < LZW_DICT_MAX) { dict.set(key, dictSize++); }
        w = [v];
      }
    }
    if (w.length > 0) result.push(w.length === 1 ? w[0] : dict.get(w.join(','))!);
    return result;
  };

  // LZW 解压：整数数组 → 整数数组
  const lzwDecompressInts = (codes: number[]): number[] => {
    const dict = new Map<number, number[]>();
    let dictSize = LZW_BASE;
    const result: number[] = [];
    if (!codes.length) return result;
    let w = [codes[0]];
    result.push(...w);
    for (let i = 1; i < codes.length; i++) {
      const k = codes[i];
      let entry: number[];
      if (k < LZW_BASE) {
        entry = [k];
      } else if (dict.has(k)) {
        entry = dict.get(k)!;
      } else if (k === dictSize) {
        entry = [...w, w[0]];
      } else {
        return result;
      }
      result.push(...entry);
      if (dictSize < LZW_DICT_MAX) { dict.set(dictSize++, [...w, entry[0]]); }
      w = entry;
    }
    return result;
  };

  // 按位置派生密钥流：每个位置独立 32-bit 偏移，密钥空间 ≈ keyLen × 2^32
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

  // 加密：RLE压缩 → LZW压缩 → XOR加密 → 自定义字符编码
  const encrypt = (text: string, key?: string): { result: string; ratio: number } => {
    if (!text) return { result: '', ratio: 0 };

    const chars = customChars;

    // 第一步：明文 charCode 数组
    const plainCodes: number[] = [];
    for (let i = 0; i < text.length; i++) plainCodes.push(text.charCodeAt(i));

    // 压缩前长度（基准，用于计算压缩率）
    const uncompressedLen = codesToStr(plainCodes, chars, customSeparator).length;

    // 第二步：RLE 压缩明文码流
    const rled = rleEncode(plainCodes);

    // 第三步：LZW 压缩
    const lzwed = lzwCompressInts(rled);

    // 第四步：按位置密钥流 XOR + 差分 XOR（加密）
    const keyOffsets = useKey && key ? getKeyOffsets(key, lzwed.length) : null;
    const adjusted = lzwed.map((v, i) => keyOffsets ? (v ^ keyOffsets[i]) : v);
    const xored: number[] = [adjusted[0]];
    for (let i = 1; i < adjusted.length; i++) xored.push(adjusted[i] ^ adjusted[i - 1]);

    // 第五步：编码为自定义字符
    const result = codesToStr(xored, chars, customSeparator);

    const ratio = uncompressedLen > 0
      ? Math.round((1 - result.length / uncompressedLen) * 100)
      : 0;

    return { result, ratio };
  };

  // 解密：自定义字符解码 → 逆XOR → LZW解压 → RLE解压 → 原文
  const decrypt = (text: string, key?: string): string => {
    if (!text) return '';

    const chars = customChars;

    // 第一步：解码自定义字符 → XOR 流
    const xored = strToCodes(text, chars, customSeparator);
    if (!xored.length) return '';

    // 第二步：逆差分 XOR
    const adjusted: number[] = [xored[0]];
    for (let i = 1; i < xored.length; i++) adjusted.push(xored[i] ^ adjusted[i - 1]);

    // 第三步：去除按位置密钥流 XOR（XOR 自反，与加密相同操作即可还原）
    const keyOffsets = useKey && key ? getKeyOffsets(key, adjusted.length) : null;
    const lzwed = adjusted.map((v, i) => keyOffsets ? (v ^ keyOffsets[i]) : v);

    // 第四步：LZW 解压
    const rled = lzwDecompressInts(lzwed);

    // 第五步：RLE 解压 → 原始 charCode → 转回字符
    const plainCodes = rleDecode(rled);
    return plainCodes.map(c => c >= 0 ? String.fromCharCode(c) : '').join('');
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

  // 从剪贴板粘贴内容
  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setInputText(text);
    } catch (err) {
      console.error('粘贴失败:', err);
    }
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
            <div className="max-h-[400px] overflow-y-auto">
              <ul className="space-y-2 mb-4">
                {CHANGELOG_ITEMS.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>

              {/* 以往更新折叠区 */}
              {CHANGELOG_PREVIOUS.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => setShowPreviousChangelog(!showPreviousChangelog)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 rounded-lg border border-gray-200 hover:bg-gray-200 transition-colors"
                  >
                    <span className="text-sm font-semibold text-gray-700">以往更新内容</span>
                    <span className="text-xs text-gray-500">{showPreviousChangelog ? '▲' : '▼'}</span>
                  </button>
                  {showPreviousChangelog && (
                    <div className="mt-3 space-y-4">
                      {CHANGELOG_PREVIOUS.map((section, si) => (
                        <div key={si}>
                          <p className="text-xs font-semibold text-gray-500 mb-2 ml-1">{section.version}</p>
                          <ul className="space-y-2">
                            {section.items.map((item, ii) => (
                              <li key={ii} className="flex items-start gap-2 text-sm text-gray-700">
                                <span className="mt-1.5 w-2 h-2 rounded-full bg-gray-400 shrink-0" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={dismissChangelog}
              className="w-full py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition-colors mt-4"
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
                {inputText ? (
                  <Button
                    onClick={clearInputText}
                    variant="outline"
                    size="sm"
                    className="transition-all duration-300 hover:bg-red-50 hover:border-red-300 hover:text-red-600"
                  >
                    <X className="w-4 h-4 mr-1" />
                    清除
                  </Button>
                ) : (
                  <Button
                    onClick={pasteFromClipboard}
                    variant="outline"
                    size="sm"
                    className="transition-all duration-300 hover:bg-blue-50"
                  >
                    <ClipboardPaste className="w-4 h-4 mr-2" />
                    粘贴
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