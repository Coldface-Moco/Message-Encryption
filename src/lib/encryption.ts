// 核心加密解密逻辑 - 无任何 DOM/React 依赖，可以在 Web 和 React Native 之间共享

const RLE_MARKER = 131072;
const LZW_BASE = 262144;
const LZW_MAX_DICT = 524288; // 字典上限，防止极端输入导致内存溢出

/** Zigzag 编码：将任意整数（含负数）双射到非负整数 */
function zigzag(n: number): number { return n >= 0 ? n * 2 : -n * 2 - 1; }
/** Zigzag 解码：还原原始整数 */
function unzigzag(n: number): number { return n % 2 === 0 ? n / 2 : -(n + 1) / 2; }

/** 将整数码序列编码为自定义字符串（无最小填充，负数安全） */
function codesToStr(codes: number[], chars: string[], sep: string): string {
  const base = chars.length;
  if (base < 2 || base > 36) throw new Error('自定义字符数量必须在 2-36 之间');
  return codes.map(val => {
    const s = zigzag(val).toString(base);
    return [...s].map(d => {
      const idx = parseInt(d, base);
      if (idx < 0 || idx >= base) throw new Error('编码字符超出范围');
      return chars[idx];
    }).join('');
  }).join(sep);
}

/** 将自定义字符串解码为整数码序列（逐字符累加，避免 parseInt 长串溢出） */
function strToCodes(text: string, chars: string[], sep: string): number[] {
  const base = chars.length;
  return text.split(sep).filter(Boolean).map(group => {
    let val = 0;
    for (const ch of group) {
      const idx = chars.indexOf(ch);
      if (idx !== -1) val = val * base + idx;
    }
    return unzigzag(val);
  });
}

/** RLE 编码：连续3+相同值压缩 */
function rleEncode(arr: number[]): number[] {
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
}

/** RLE 解码（含边界检查，防止截断数据导致崩溃） */
function rleDecode(arr: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < arr.length) {
    if (arr[i] === RLE_MARKER) {
      if (i + 2 >= arr.length) throw new Error('RLE 数据格式错误：标记后数据不完整');
      const v = arr[i + 1], count = arr[i + 2];
      for (let k = 0; k < count; k++) out.push(v);
      i += 3;
    } else { out.push(arr[i]); i++; }
  }
  return out;
}

/** LZW 压缩：整数数组 → 整数数组（字典大小上限防止内存溢出） */
function lzwCompressInts(arr: number[]): number[] {
  const dict = new Map<string, number>();
  let dictSize = LZW_BASE;
  const result: number[] = [];
  let w: number[] = [];
  for (const v of arr) {
    const wv = [...w, v]; const key = wv.join(',');
    if (w.length === 0 || dict.has(key)) { w = wv; }
    else {
      result.push(w.length === 1 ? w[0] : dict.get(w.join(','))!);
      if (dictSize < LZW_MAX_DICT) dict.set(key, dictSize++);
      w = [v];
    }
  }
  if (w.length > 0) result.push(w.length === 1 ? w[0] : dict.get(w.join(','))!);
  return result;
}

/** LZW 解压：整数数组 → 整数数组（遇到无效编码时抛出错误） */
function lzwDecompressInts(codes: number[]): number[] {
  const dict = new Map<number, number[]>();
  let dictSize = LZW_BASE;
  const result: number[] = [];
  if (!codes.length) return result;
  let w = [codes[0]]; result.push(...w);
  for (let i = 1; i < codes.length; i++) {
    const k = codes[i]; let entry: number[];
    if (k < LZW_BASE) entry = [k];
    else if (dict.has(k)) entry = dict.get(k)!;
    else if (k === dictSize) entry = [...w, w[0]];
    else throw new Error('LZW 解压遇到无效编码，密文可能已损坏或密钥不匹配');
    result.push(...entry); if (dictSize < LZW_MAX_DICT) dict.set(dictSize++, [...w, entry[0]]); w = entry;
  }
  return result;
}

/**
 * 按位置派生密钥流：对每个位置 i 用 key 和 i 混合生成独立的 32-bit 偏移量。
 * 密钥空间 ≈ key.length × 2^32，远超原来的 1000 种固定偏移。
 */
export function getKeyOffsets(key: string, length: number): number[] {
  const offsets: number[] = [];
  let state = 0x12345678;
  for (let i = 0; i < length; i++) {
    const kc = key.charCodeAt(i % key.length);
    state = (Math.imul(state ^ kc, 0x9e3779b9) >>> 0);
    state = (((state << 13) | (state >>> 19)) ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0;
    offsets.push(state);
  }
  return offsets;
}

/**
 * 加密：RLE压缩 → LZW压缩 → XOR加密 → 自定义字符编码
 * 返回 { result, ratio } ratio为压缩率百分比
 */
export function encrypt(
  text: string,
  options: {
    customChars: string[];
    customSeparator: string;
    useKey: boolean;
    key?: string;
  }
): { result: string; ratio: number } {
  if (!text) return { result: '', ratio: 0 };

  const { customChars, customSeparator, useKey, key } = options;

  // 第一步：明文 charCode 数组
  const plainCodes: number[] = [];
  for (let i = 0; i < text.length; i++) plainCodes.push(text.charCodeAt(i));

  // 压缩前长度（基准）
  const uncompressedLen = codesToStr(plainCodes, customChars, customSeparator).length;

  // 第二步：RLE 压缩明文码流
  const rled = rleEncode(plainCodes);

  // 第三步：LZW 压缩
  const lzwed = lzwCompressInts(rled);

  // 第四步：XOR 密钥流（加密）+ 差分 XOR
  // 使用 XOR 应用密钥而非加法，天然在 32-bit 内封闭，无溢出问题
  const keyOffsets = useKey && key ? getKeyOffsets(key, lzwed.length) : null;
  const adjusted = lzwed.map((v, i) => keyOffsets ? v ^ keyOffsets[i] : v);
  const xored: number[] = [adjusted[0]];
  for (let i = 1; i < adjusted.length; i++) xored.push(adjusted[i] ^ adjusted[i - 1]);

  // 第五步：编码为自定义字符
  const result = codesToStr(xored, customChars, customSeparator);

  const ratio = uncompressedLen > 0
    ? Math.round((1 - result.length / uncompressedLen) * 100)
    : 0;
  return { result, ratio };
}

/**
 * 解密：自定义字符解码 → 逆XOR → LZW解压 → RLE解压 → 原文
 */
export function decrypt(
  text: string,
  options: {
    customChars: string[];
    customSeparator: string;
    useKey: boolean;
    key?: string;
  }
): string {
  if (!text) return '';

  const { customChars, customSeparator, useKey, key } = options;

  // 第一步：解码自定义字符 → XOR 流
  const xored = strToCodes(text, customChars, customSeparator);
  if (!xored.length) return '';

  // 第二步：逆差分 XOR
  const adjusted: number[] = [xored[0]];
  for (let i = 1; i < xored.length; i++) adjusted.push(xored[i] ^ adjusted[i - 1]);

  // 第三步：XOR 密钥流（解密，自反运算）
  const keyOffsets = useKey && key ? getKeyOffsets(key, adjusted.length) : null;
  const lzwed = adjusted.map((v, i) => keyOffsets ? v ^ keyOffsets[i] : v);

  // 第四步：LZW 解压
  const rled = lzwDecompressInts(lzwed);

  // 第五步：RLE 解压 → 原始 charCode → 转回字符
  const plainCodes = rleDecode(rled);
  return plainCodes.map(c => String.fromCharCode(c)).join('');
}
