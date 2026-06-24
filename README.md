更新内容

新增 OTA 在线更新功能，支持热更新无需重新安装

修复负数编码符号丢失导致解密失败的问题

修复 parseInt 长串溢出导致解码精度丢失的问题

升级密钥算法：密钥空间从 1000 种扩展至 keyLen × 2³²，大幅增强安全性

修复自定义字符允许重复导致加解密错误的问题

加密/解密新增异常捕获，非法输入不再导致崩溃

隐藏密钥长度显示，改为已设置/未输入状态提示


Message Encryption — 打包 APK 指南
Android 原生打包需要 Android SDK / Gradle 工具链，当前云端构建沙箱不包含这些环境。 以下提供两种方式在 你的本地电脑 上生成 APK。

方式一：EAS Build（推荐，最简单）
EAS 是 Expo 官方提供的云端构建服务，无需在本地安装 Android SDK。

步骤
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
构建完成后，EAS 会提供一个下载链接，直接下载 APK 安装包。

项目结构说明
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
package.json 快捷命令
npm run build:preview   # EAS 云端构建 APK（preview）
npm run build:android   # EAS 云端构建 AAB（生产）
npm run android         # 在连接的 Android 设备/模拟器上运行
