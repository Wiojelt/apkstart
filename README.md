# ApkStart (TR / EN Fork)

<p align="center">
  <img src="src/ui/assets/logo.png" alt="ApkStart Logo" width="128" />
</p>

<p align="center">
  <a href="https://github.com/Wiojelt/apkstart/releases"><img src="https://img.shields.io/github/v/release/Wiojelt/apkstart?include_prereleases&sort=semver" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Platform-Windows%2010%2F11%20x64-0078D6.svg" alt="Platform" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Diller-T%C3%BCrk%C3%A7e%20%7C%20English-success.svg" alt="Languages" /></a>
</p>

---

[Türkçe](#türkçe) | [English](#english)

---

<a name="türkçe"></a>
## 🇹🇷 Türkçe

**ApkStart (TR/EN Fork)**, Windows işletim sisteminde Android uygulamalarını (.apk) doğrudan masaüstü yazılımı gibi çalıştırmanızı sağlayan bağımsız ve hafif bir başlatıcıdır. Bu sürüm, orijinal [RoutineMiku/apkstart](https://github.com/RoutineMiku/apkstart) projesinden forklanmış olup, Türkçe ve İngilizce dillerine yerelleştirilmiş ve modern masaüstü temaları ile zenginleştirilmiştir.

### ✨ Öne Çıkan Özellikler

- 🖱️ **Çift Tıklamayla Kurulum**: `.apk` dosya ilişkilendirmesi sayesinde Windows Gezgini'nde APK dosyasına çift tıklamanız yeterlidir. Uygulama otomatik ayrıştırılır, kurulur ve masaüstünüze kısayol eklenir.
- 🪟 **Bağımsız Uygulama Pencereleri**: Her uygulama tıpkı yerel bir Windows programı gibi kendi penceresinde, kendi başlığı ve simgesiyle açılır.
- 🎨 **Modern Masaüstü Temaları**:
  - **Karanlık (Slate Dark - Varsayılan)**: Gözü yormayan derin kömür ve gökyüzü mavisi vurgular.
  - **Gece Mavisi (Nord Arctic)**: Şık kutup mavisi ve dondurucu gri tonları.
  - **Aydınlık (Clean Light)**: Minimalist ve net açık tema.
  - **Sistem**: Windows temasını dinamik olarak takip eder.
- 🌐 **Yalnızca Türkçe ve İngilizce**: Fazlalık diller tamamen temizlenmiş, arayüzün her noktası Türkçe ve İngilizce olarak eksiksiz yerelleştirilmiştir.
- 🔍 **Başlat Menüsü & Windows Araması**: Yüklenen uygulamalar Başlat Menüsü'ne eklenir; Windows arama çubuğundan doğrudan aranabilir.
- 📁 **Çift Yönlü Dosya Paylaşımı**: `%USERPROFILE%\ApkStartShared` klasörü ile Android sanal diski arasındaki dosyalar anlık olarak eşitlenir.

### 🚀 Hızlı Başlangıç (Taşınabilir Sürüm)

1. [Releases](https://github.com/Wiojelt/apkstart/releases) sayfasından en son taşınabilir paketi (`ApkStart-v0.5.1-win64-portable-tr-en.zip`) indirin.
2. Arşivi istediğiniz bir klasöre çıkartın.
3. `ApkStart.exe` dosyasını çalıştırın.

### 🛠️ Geliştirici Komutları

```powershell
# Bağımlılıkları yükleyin
npm install

# Geliştirici modunda başlatın
npm start

# Birim ve entegrasyon testlerini çalıştırın
npm test

# Dil dosyalarını ve eksik çevirileri denetleyin
npm run check:i18n
```

### 🤝 Destek ve İletişim

- **Fork Sahibi & Türkçe Yerelleştirme**: [Wiojelt](https://github.com/Wiojelt)
- **Sorun Bildirimi ve İstekler**: [GitHub Issues](https://github.com/Wiojelt/apkstart/issues)
- **Orijinal Proje (Upstream)**: [RoutineMiku/apkstart](https://github.com/RoutineMiku/apkstart)

---

<a name="english"></a>
## 🇬🇧 English

**ApkStart (TR/EN Fork)** is a lightweight Windows runner for Android applications (.apk), enabling them to run seamlessly as standalone desktop software. Forked from [RoutineMiku/apkstart](https://github.com/RoutineMiku/apkstart), this edition focuses exclusively on Turkish and English localizations along with modern desktop themes.

### ✨ Key Features

- 🖱️ **Double-Click Installation**: Associate `.apk` files once and install any package directly from Windows File Explorer with automated desktop shortcut generation.
- 🪟 **Standalone Application Windows**: Each Android application runs in its own window with authentic ICO icons and titles—no intrusive emulator shells.
- 🎨 **Modern Desktop Themes**:
  - **Dark (Slate Dark - Default)**: High-contrast, easy-on-the-eyes slate and cyan accents.
  - **Nord (Arctic Blue)**: Elegant arctic cold tones and frost styling.
  - **Light (Clean Light)**: Minimalist and crisp light mode.
  - **System**: Automatically follows your Windows color preference.
- 🌐 **Focused Localization**: Exclusively ships with Turkish (`tr`) and English (`en`) support; redundant language files have been removed.
- 🔍 **Start Menu & Windows Search**: Installed apps integrate directly into your Windows Start Menu and taskbar groupings.
- 📁 **Two-Way Shared Directory**: Instant background file synchronization between `%USERPROFILE%\ApkStartShared` and Android storage.

### 🚀 Quick Start (Portable)

1. Download the latest portable bundle (`ApkStart-v0.5.1-win64-portable-tr-en.zip`) from [Releases](https://github.com/Wiojelt/apkstart/releases).
2. Extract the ZIP archive to your preferred directory.
3. Launch `ApkStart.exe`.

### 🛠️ Development & Building

```powershell
# Install dependencies
npm install

# Run in development mode
npm start

# Execute full test suite
npm test

# Audit localization completeness
npm run check:i18n
```

### 🤝 Support & Credits

- **Fork Maintainer & Turkish Localization**: [Wiojelt](https://github.com/Wiojelt)
- **Issue Tracker & Support**: [GitHub Issues](https://github.com/Wiojelt/apkstart/issues)
- **Upstream Project**: [RoutineMiku/apkstart](https://github.com/RoutineMiku/apkstart)
- **License**: [MIT](LICENSE)
