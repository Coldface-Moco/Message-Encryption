# Message-Encryption
加密对话工具，实现消息安全私密的沟通传递
# Message Encryption — 打包 APK 指南

Android 原生打包需要 Android SDK / Gradle 工具链，当前云端构建沙箱不包含这些环境。
以下提供两种方式在 **你的本地电脑** 上生成 APK。

---

## 方式一：EAS Build（推荐，最简单）

EAS 是 Expo 官方提供的云端构建服务，无需在本地安装 Android SDK。

### 步骤

```bash
# 1. 安装 EAS CLI（如未安装）
npm install -g eas-cli

# 2. 登录 Expo 账号（免费注册：https://expo.dev）
eas login

# 3. 进入移动端项目目录
cd mobile

# 4. 初始化 EAS 配置（已存在 eas.json 可跳过）
eas build:configure

# 5. 构建 APK（preview 模式，直接产出 .apk 文件）
eas build --profile preview --platform android
```

构建完成后，EAS 会提供一个下载链接，直接下载 APK 安装包。

---

## 方式二：本地构建（需要安装 Android Studio）

### 前置条件
- 安装 [Android Studio](https://developer.android.com/studio)
- 配置环境变量 `ANDROID_HOME`
- 安装 JDK 17+

### 步骤

```bash
# 1. 进入移动端项目目录
cd mobile

# 2. 安装依赖（已执行可跳过）
npm install

# 3. Android 原生工程已通过 prebuild 生成，直接构建
cd android

# 4. 生成 debug APK（快速验证）
./gradlew assembleDebug

# 输出路径：android/app/build/outputs/apk/debug/app-debug.apk

# 5. 生成 release APK（发布版本）
./gradlew assembleRelease

# 输出路径：android/app/build/outputs/apk/release/app-release.apk
```

---

## 项目结构说明

```
mobile/
├── App.tsx                    # 主界面（React Native）
├── src/utils/encryption.ts    # 加密/解密核心逻辑
├── android/                   # 已生成的 Android 原生工程
│   ├── app/
│   │   ├── build.gradle
│   │   └── src/
│   └── gradlew                # Gradle 构建脚本
├── app.json                   # Expo 应用配置
├── eas.json                   # EAS Build 配置
└── package.json               # 含构建命令
```

## package.json 快捷命令

```bash
npm run build:preview   # EAS 云端构建 APK（preview）
npm run build:android   # EAS 云端构建 AAB（生产）
npm run android         # 在连接的 Android 设备/模拟器上运行
```

---

> 推荐使用 **方式一（EAS Build）**，只需注册免费账号即可，无需配置本地环境。
