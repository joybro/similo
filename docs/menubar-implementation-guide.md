# macOS Menubar App Implementation Guide

reword 앱 구현을 참고하여 정리한 macOS 메뉴바 앱 구현 가이드.

> **Reference:** 실제 구현 코드는 `~/Work/reword`에서 직접 확인 가능

---

## 1. Technology Stack

**Framework:** Electron 28.x + Electron Forge
- `electron-forge`로 패키징 및 배포
- TypeScript 기반 개발

**Core Modules:**
```typescript
import { app, Tray, Menu, BrowserWindow, screen, ipcMain, nativeImage, globalShortcut } from 'electron';
```

---

## 2. Tray Icon 등록

### 기본 구현

```typescript
import { Tray, Menu, nativeImage } from 'electron';
import path from 'path';

let tray: Tray | null = null;  // 전역 변수로 유지 (GC 방지)

function createTray(): void {
    // Template 이미지 사용 (macOS 테마 자동 적용)
    const iconPath = path.join(__dirname, '../assets/trayTemplate.png');
    let trayIcon = nativeImage.createFromPath(iconPath);
    trayIcon.setTemplateImage(true);  // 라이트/다크 모드 자동 대응

    tray = new Tray(trayIcon);

    // 클릭 이벤트
    tray.on('click', () => updateTrayMenu());
    tray.on('right-click', () => updateTrayMenu());

    // 툴팁 설정
    tray.setToolTip('Similo - Semantic Search');

    // 메뉴 설정
    updateTrayMenu();
}
```

### Tray Icon 파일

- `trayTemplate.png` - 일반 해상도
- `trayTemplate@2x.png` - Retina 해상도
- 크기: 약 16x16 또는 22x22 픽셀
- `Template` 접미사로 macOS가 자동으로 테마에 맞게 색상 조정

### 동적 메뉴 업데이트

```typescript
function updateTrayMenu(): void {
    const menuTemplate: MenuItemConstructorOptions[] = [
        {
            label: 'Server Running',
            enabled: false,
        },
        { type: 'separator' },
        {
            label: 'Start Server',
            click: () => startServer(),
        },
        {
            label: 'Stop Server',
            click: () => stopServer(),
        },
        { type: 'separator' },
        {
            label: 'Settings...',
            click: () => openSettings(),
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => app.quit(),
        },
    ];

    tray?.setContextMenu(Menu.buildFromTemplate(menuTemplate));
}
```

---

## 3. Dock Icon 숨기기 (메뉴바 전용 앱)

```typescript
app.whenReady().then(() => {
    // macOS에서 Dock 아이콘 숨기기
    if (process.platform === 'darwin' && app.dock) {
        app.dock.hide();
    }

    createTray();
    // ...
});
```

**필요 시 Dock 다시 표시:**
```typescript
if (process.platform === 'darwin' && app.dock) {
    app.dock.show();  // 설정 창 열 때 등
}
```

---

## 4. 앱 종료 방지

메뉴바 앱은 모든 창이 닫혀도 계속 실행되어야 함:

```typescript
app.on('window-all-closed', (e: Event) => {
    e.preventDefault();  // 백그라운드 실행 유지
});
```

---

## 5. Global Keyboard Shortcuts

```typescript
import { globalShortcut } from 'electron';

function registerShortcuts(): void {
    globalShortcut.unregisterAll();

    // 기본 단축키 등록
    globalShortcut.register('CommandOrControl+Shift+S', () => {
        // 검색 UI 열기
        openSearchWindow();
    });
}

// 앱 종료 시 정리
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});
```

---

## 6. BrowserWindow 설정

### 설정 창 예시

```typescript
function createSettingsWindow(): BrowserWindow {
    const settingsWindow = new BrowserWindow({
        width: 500,
        height: 540,
        frame: false,           // 네이티브 프레임 제거
        transparent: false,
        alwaysOnTop: false,
        skipTaskbar: true,      // 태스크바에 표시 안 함
        resizable: false,
        movable: true,
        hasShadow: true,
        show: false,            // 준비될 때까지 숨김
        backgroundColor: '#ffffff',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    settingsWindow.loadFile('settings.html');

    settingsWindow.once('ready-to-show', () => {
        settingsWindow.show();
    });

    return settingsWindow;
}
```

### 오버레이/팝업 창 (항상 위)

```typescript
const overlayWindow = new BrowserWindow({
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    focusable: true,
    // ...
});

// 모든 데스크탑/풀스크린 위에 표시
overlayWindow.setAlwaysOnTop(true, 'screen-saver');
overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
```

---

## 7. IPC 통신 패턴

### Preload Script (보안 브릿지)

```typescript
// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    // invoke: 응답을 기다리는 양방향 통신
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config: object) => ipcRenderer.invoke('save-config', config),

    // on: 메인 프로세스에서 보내는 이벤트 수신
    onServerStatus: (callback: (status: string) => void) => {
        ipcRenderer.on('server-status', (_event, status) => callback(status));
    },

    // send: 단방향 통신
    closeWindow: () => ipcRenderer.send('close-window'),
});
```

### Main Process 핸들러

```typescript
// main.ts 또는 ipc-handlers.ts
import { ipcMain } from 'electron';

function setupIpcHandlers(): void {
    // invoke 핸들러
    ipcMain.handle('get-config', async () => {
        return getConfig();
    });

    ipcMain.handle('save-config', async (_event, config) => {
        saveConfig(config);
        return { success: true };
    });

    // send 핸들러
    ipcMain.on('close-window', (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        window?.close();
    });
}
```

### Renderer에서 사용

```typescript
// renderer.ts (또는 HTML 내 script)
async function loadSettings() {
    const config = await window.electronAPI.getConfig();
    // config 사용
}

window.electronAPI.onServerStatus((status) => {
    updateStatusUI(status);
});
```

---

## 8. 설정 저장 (Config Storage)

### 위치

```typescript
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

const configDir = app.getPath('userData');
// macOS: ~/Library/Application Support/<app-name>/
const configPath = path.join(configDir, 'config.json');
```

### 읽기/쓰기

```typescript
interface SimiloConfig {
    server: {
        port: number;
        autoStart: boolean;
    };
    ollama: {
        host: string;
        model: string;
    };
    // ...
}

function getConfig(): SimiloConfig {
    try {
        const data = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(data);
    } catch {
        return getDefaultConfig();
    }
}

function saveConfig(config: SimiloConfig): void {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}
```

### API Key 암호화 (safeStorage)

```typescript
import { safeStorage } from 'electron';

function saveApiKey(apiKey: string): void {
    if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(apiKey).toString('base64');
        setConfigValue('apiKey', encrypted);
    }
}

function getApiKey(): string | null {
    const encrypted = getConfigValue('apiKey');
    if (encrypted && safeStorage.isEncryptionAvailable()) {
        try {
            return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
        } catch {
            return null;
        }
    }
    return null;
}
```

---

## 9. 멀티 모니터 지원

```typescript
import { screen, Display } from 'electron';

// 모든 디스플레이에 오버레이 생성
function createOverlayWindows(): void {
    const displays = screen.getAllDisplays();

    displays.forEach((display) => {
        const { x, y, width, height } = display.bounds;

        const overlay = new BrowserWindow({
            x, y, width, height,
            // ...
        });
    });
}

// 디스플레이 변경 감지
screen.on('display-added', () => {
    createOverlayWindows();
});

screen.on('display-removed', () => {
    createOverlayWindows();
});
```

---

## 10. 앱 시작 흐름

```typescript
app.whenReady().then(async () => {
    // 1. 로거 초기화
    initLogger();

    // 2. Dock 숨기기 (macOS)
    if (process.platform === 'darwin' && app.dock) {
        app.dock.hide();
    }

    // 3. Tray 생성
    createTray();

    // 4. 창 생성 (필요시)
    createSettingsWindow();

    // 5. 단축키 등록
    registerShortcuts();

    // 6. IPC 핸들러 설정
    setupIpcHandlers();

    // 7. 서버 자동 시작 (설정에 따라)
    const config = getConfig();
    if (config.server.autoStart) {
        await startServer();
    }
});
```

---

## 11. 프로젝트 구조

```
src/
├── main/
│   ├── main.ts           # 앱 진입점, Tray, 창 관리
│   ├── ipc-handlers.ts   # IPC 통신 핸들러
│   ├── preload.ts        # 보안 브릿지
│   ├── config.ts         # 설정 관리
│   └── server.ts         # 내장 서버 관리
├── renderer/
│   ├── settings.html     # 설정 UI
│   ├── settings.ts       # 설정 로직
│   └── styles.css
└── assets/
    ├── trayTemplate.png
    └── trayTemplate@2x.png
```

---

## 12. Electron Forge 설정

### forge.config.js 예시

```javascript
module.exports = {
    packagerConfig: {
        asar: true,
        icon: './assets/icon',
        appBundleId: 'com.example.similo',
    },
    makers: [
        {
            name: '@electron-forge/maker-dmg',
            config: {
                format: 'ULFO',
            },
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['darwin'],
        },
    ],
};
```

---

## 13. 참고 사항

### Template Image

- `setTemplateImage(true)` 사용 시 macOS가 자동으로 라이트/다크 모드에 맞게 아이콘 색상 조정
- 아이콘은 단색(검정)으로 제작해야 함

### Window Level

| Level | 용도 |
|-------|------|
| `normal` | 일반 창 |
| `floating` | 항상 위 (일반) |
| `torn-off-menu` | 메뉴 수준 |
| `modal-panel` | 모달 |
| `main-menu` | 메인 메뉴 |
| `status` | 상태바 |
| `pop-up-menu` | 팝업 메뉴 |
| `screen-saver` | 모든 것 위 |

### 보안 고려사항

- `nodeIntegration: false` 필수
- `contextIsolation: true` 필수
- API 키는 `safeStorage`로 암호화
- preload script로 필요한 API만 노출
