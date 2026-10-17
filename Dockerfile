# File: Dockerfile
# Version: 1.1.0
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Install OpenJDK 21 (required by Capacitor 7 / Android Gradle Plugin 8+) and ADB
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    unzip \
    git \
    openjdk-21-jdk \
    usbutils \
    android-tools-adb \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 24 LTS
ENV NODE_VERSION=24.11.0
RUN curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1

# Set up Android SDK variables
ENV ANDROID_HOME=/opt/android-sdk
ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
ENV PATH=${PATH}:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools

# Download and install Android Command Line Tools
RUN mkdir -p ${ANDROID_HOME}/cmdline-tools \
    && wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O android_tools.zip \
    && unzip -q android_tools.zip -d ${ANDROID_HOME}/cmdline-tools \
    && mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest \
    && rm android_tools.zip

# Accept licenses and install Android SDK 35 (Capacitor 7 target)
RUN yes | sdkmanager --licenses \
    && sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0" \
    && chmod -R 777 ${ANDROID_HOME}

WORKDIR /app
