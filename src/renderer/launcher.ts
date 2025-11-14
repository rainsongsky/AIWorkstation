/**
 * 启动器渲染进程逻辑
 * 处理启动器界面的所有交互
 */

class LauncherApp {
  private readonly launchButton: HTMLButtonElement;
  private readonly startButton: HTMLButtonElement;
  private readonly startButtonText: HTMLSpanElement;
  private isLaunching: boolean = false;

  constructor() {
    this.launchButton = document.querySelector('#launch-btn') as HTMLButtonElement;
    this.startButton = document.querySelector('#start-button') as HTMLButtonElement;
    this.startButtonText = document.querySelector('#start-button-text') as HTMLSpanElement;

    this.init();
  }

  /**
   * 初始化启动器
   */
  private init(): void {
    this.setupTitleBarControls();
    this.setupLaunchButton();
    this.setupFolderButtons();
    this.setupMenuButtons();
    this.loadVersionInfo();

    // 通知主进程渲染器已就绪
    const api = globalThis.electronAPI;
    if (api?.sendReady) {
      void api.sendReady();
    }
  }

  /**
   * 设置标题栏控制按钮
   */
  private setupTitleBarControls(): void {
    const minimizeBtn = document.querySelector('#minimize-btn');
    const maximizeBtn = document.querySelector('#maximize-btn');
    const closeBtn = document.querySelector('#close-btn');

    minimizeBtn?.addEventListener('click', () => {
      void this.handleWindowControl('minimize');
    });

    maximizeBtn?.addEventListener('click', () => {
      void this.handleWindowControl('maximize');
    });

    closeBtn?.addEventListener('click', () => {
      void this.handleWindowControl('close');
    });
  }

  /**
   * 处理窗口控制操作
   */
  private async handleWindowControl(action: 'minimize' | 'maximize' | 'close'): Promise<void> {
    const api = globalThis.electronAPI;
    if (api?.Launcher?.windowControl) {
      await api.Launcher.windowControl(action);
    }
  }

  /**
   * 设置大启动按钮（左侧边栏）
   */
  private setupLaunchButton(): void {
    this.launchButton?.addEventListener('click', () => {
      void this.handleLaunch();
    });
  }

  /**
   * 设置文件夹按钮
   */
  private setupFolderButtons(): void {
    const folderButtons = document.querySelectorAll<HTMLButtonElement>('.folder-card');

    for (const button of folderButtons) {
      button.addEventListener('click', () => {
        const folderKey = button.dataset.folder;
        if (folderKey) {
          void this.handleOpenFolder(folderKey);
        }
      });
    }
  }

  /**
   * 处理打开文件夹操作
   */
  private async handleOpenFolder(folderKey: string): Promise<void> {
    const api = globalThis.electronAPI;
    if (api?.Launcher?.openFolder) {
      try {
        await api.Launcher.openFolder(folderKey);
      } catch (error) {
        console.error(`Failed to open folder: ${folderKey}`, error);
      }
    }
  }

  /**
   * 设置菜单按钮
   */
  private setupMenuButtons(): void {
    const menuButtons = document.querySelectorAll<HTMLButtonElement>('.menu-item');

    for (const button of menuButtons) {
      button.addEventListener('click', () => {
        const action = button.dataset.action;
        this.handleMenuAction(action);
      });
    }
  }

  /**
   * 处理菜单操作
   * @param action 菜单操作类型
   */
  private handleMenuAction(action: string | undefined): void {
    if (!action) return;

    console.log(`Menu action: ${action}`);

    // 这里可以扩展更多菜单功能
    switch (action) {
      case 'advanced':
        console.log('打开高级选项');
        break;
      case 'troubleshoot':
        console.log('打开疑难解答');
        break;
      case 'version':
        console.log('打开版本管理');
        break;
      case 'community':
        console.log('打开交流群');
        break;
      case 'settings':
        console.log('打开设置');
        break;
      default:
        console.log(`Unknown action: ${action}`);
    }
  }

  /**
   * 处理启动 ComfyUI
   */
  private async handleLaunch(): Promise<void> {
    if (this.isLaunching) {
      console.log('Already launching...');
      return;
    }

    this.isLaunching = true;
    this.setLaunchingState(true);

    try {
      const api = globalThis.electronAPI;
      if (api?.Launcher?.startComfyUI) {
        await api.Launcher.startComfyUI();
        console.log('ComfyUI started successfully');
      } else {
        console.error('electronAPI.Launcher.startComfyUI is not available');
        this.setLaunchingState(false);
        this.isLaunching = false;
      }
    } catch (error) {
      console.error('Failed to start ComfyUI:', error);
      this.setLaunchingState(false);
      this.isLaunching = false;
    }
  }

  /**
   * 设置启动状态 UI
   * @param isLaunching 是否正在启动
   */
  private setLaunchingState(isLaunching: boolean): void {
    if (isLaunching) {
      this.launchButton.classList.add('loading');
      this.launchButton.disabled = true;
      this.startButton.classList.add('disabled');
      this.startButtonText.textContent = '启动中...';
    } else {
      this.launchButton.classList.remove('loading');
      this.launchButton.disabled = false;
      this.startButton.classList.remove('disabled');
      this.startButtonText.textContent = '运行中';
    }
  }

  /**
   * 加载版本信息
   */
  private loadVersionInfo(): void {
    try {
      const api = globalThis.electronAPI;

      // 获取 ComfyUI 版本
      if (api?.getComfyUIVersion) {
        const version = api.getComfyUIVersion();
        const versionElement = document.querySelector('#comfyui-version');
        if (versionElement) {
          versionElement.textContent = version || '未知';
        }
      }

      // 获取平台信息
      if (api?.getPlatform) {
        const platform = api.getPlatform();
        const platformElement = document.querySelector('#activation-platform');
        if (platformElement) {
          const platformMap: Record<string, string> = {
            darwin: 'macOS',
            win32: 'Windows',
            linux: 'Linux',
          };
          platformElement.textContent = platformMap[platform] || platform;
        }
      }
    } catch (error) {
      console.error('Failed to load version info:', error);
    }
  }
}

// 当 DOM 加载完成后初始化应用
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new LauncherApp();
  });
} else {
  new LauncherApp();
}
