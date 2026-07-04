# Message Encryption

消息加密与压缩工具 - 支持 RLE、LZW 和 Zigzag 算法的 Web 应用和移动端应用。
Web版演示地址：https://coldface-moco.github.io/Message-Encryption/
## 项目简介

Message Encryption 是一个用于消息加密和压缩的工具应用，提供两种使用方式：

1. **Web 版本** - 基于 React + Vite + TypeScript + Tailwind CSS 构建
2. **移动端版本** - 基于 React Native (Expo) 构建

核心功能包含三种压缩/编码算法：

- **RLE (Run-Length Encoding)** - 游程编码，一种简单的无损压缩算法
- **LZW (Lempel-Ziv-Welch)** - LZW 无损压缩算法
- **Zigzag** - Zigzag 编码变换

## 技术栈

### Web 版本
- React 18
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui 组件库

### 移动端版本
- React Native
- Expo
- TypeScript

## 开始使用

### Web 版本

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 移动端版本

```bash
# 进入移动端目录
cd mobile

# 安装依赖
npm install

# 启动 Expo 开发服务器
npx expo start
```

## 移动端打包 APK

移动端项目提供了两种打包方式：

### 方式一：EAS Build（推荐）

```bash
# 1. 安装 EAS CLI（如未安装）
npm install -g eas-cli

# 2. 登录 Expo 账号
eas login

# 3. 构建 APK
eas build -p android --profile preview
```

### 方式二：本地构建

需要安装 Android Studio：

```bash
# 进入移动端目录
cd mobile

# 生成 debug APK
cd android && ./gradlew assembleDebug

# 输出路径：android/app/build/outputs/apk/debug/app-debug.apk

# 生成 release APK
cd android && ./gradlew assembleRelease

# 输出路径：android/app/build/outputs/apk/release/app-release.apk
```

## 功能说明

### 核心算法

1. **Zigzag 编码**：将整数转换为变长编码，适合小的正整数
2. **RLE 编码**：将连续重复的数据压缩为“值+计数”的形式
3. **LZW 压缩**：基于字典的无损压缩算法

### 变更日志

应用内集成了变更日志功能，可在应用设置中查看版本更新历史。

## 项目结构

```
.
├── src/                    # Web 版本源码
│   ├── components/         # UI 组件
│   ├── lib/               # 工具函数
│   ├── App.tsx            # 主应用组件
│   └── main.tsx           # 入口文件
├── mobile/                # 移动端版本源码
│   ├── src/              # 源代码
│   │   ├── hooks/        # 自定义 Hooks
│   │   └── utils/        # 工具函数
│   ├── App.tsx           # 主应用组件
│   └── BUILD_GUIDE.md   # 打包指南
└── package.json         # Web 版本依赖配置
```

## 许可证

MIT License
