"use strict";
;
!(function() {
  try {
    var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {}, n = new e.Error().stack;
    n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "2fa664dc-a6a8-428d-ae4d-5f2402f8830e", e._sentryDebugIdIdentifier = "sentry-dbid-2fa664dc-a6a8-428d-ae4d-5f2402f8830e");
  } catch (e2) {
  }
})();
require("./_sentry-release-injection-file-CKfiH73b.cjs");
class LauncherApp {
  launchButton;
  startButton;
  startButtonText;
  isLaunching = false;
  constructor() {
    this.launchButton = document.getElementById("launch-btn");
    this.startButton = document.getElementById("start-button");
    this.startButtonText = document.getElementById("start-button-text");
    this.init();
  }
  /**
   * 初始化启动器
   */
  init() {
    this.setupTitleBarControls();
    this.setupLaunchButton();
    this.setupFolderButtons();
    this.setupMenuButtons();
    this.loadVersionInfo();
    const electronAPI = window.electronAPI;
    if (electronAPI?.sendReady) {
      electronAPI.sendReady();
    }
  }
  /**
   * 设置标题栏控制按钮
   */
  setupTitleBarControls() {
    const minimizeBtn = document.getElementById("minimize-btn");
    const maximizeBtn = document.getElementById("maximize-btn");
    const closeBtn = document.getElementById("close-btn");
    const electronAPI = window.electronAPI;
    minimizeBtn?.addEventListener("click", async () => {
      await electronAPI?.Launcher.windowControl("minimize");
    });
    maximizeBtn?.addEventListener("click", async () => {
      await electronAPI?.Launcher.windowControl("maximize");
    });
    closeBtn?.addEventListener("click", async () => {
      await electronAPI?.Launcher.windowControl("close");
    });
  }
  /**
   * 设置大启动按钮（左侧边栏）
   */
  setupLaunchButton() {
    this.launchButton?.addEventListener("click", () => {
      this.handleLaunch();
    });
  }
  /**
   * 设置文件夹按钮
   */
  setupFolderButtons() {
    const folderButtons = document.querySelectorAll(".folder-card");
    const electronAPI = window.electronAPI;
    folderButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const folderKey = button.getAttribute("data-folder");
        if (folderKey && electronAPI?.Launcher.openFolder) {
          try {
            await electronAPI.Launcher.openFolder(folderKey);
          } catch (error) {
            console.error(`Failed to open folder: ${folderKey}`, error);
          }
        }
      });
    });
  }
  /**
   * 设置菜单按钮
   */
  setupMenuButtons() {
    const menuButtons = document.querySelectorAll(".menu-item");
    menuButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.getAttribute("data-action");
        this.handleMenuAction(action);
      });
    });
  }
  /**
   * 处理菜单操作
   * @param action 菜单操作类型
   */
  handleMenuAction(action) {
    if (!action) return;
    console.log(`Menu action: ${action}`);
    switch (action) {
      case "advanced":
        console.log("打开高级选项");
        break;
      case "troubleshoot":
        console.log("打开疑难解答");
        break;
      case "version":
        console.log("打开版本管理");
        break;
      case "community":
        console.log("打开交流群");
        break;
      case "settings":
        console.log("打开设置");
        break;
      default:
        console.log(`Unknown action: ${action}`);
    }
  }
  /**
   * 处理启动 ComfyUI
   */
  async handleLaunch() {
    if (this.isLaunching) {
      console.log("Already launching...");
      return;
    }
    this.isLaunching = true;
    this.setLaunchingState(true);
    const electronAPI = window.electronAPI;
    try {
      if (electronAPI?.Launcher.startComfyUI) {
        await electronAPI.Launcher.startComfyUI();
        console.log("ComfyUI started successfully");
      } else {
        console.error("electronAPI.Launcher.startComfyUI is not available");
        this.setLaunchingState(false);
        this.isLaunching = false;
      }
    } catch (error) {
      console.error("Failed to start ComfyUI:", error);
      this.setLaunchingState(false);
      this.isLaunching = false;
    }
  }
  /**
   * 设置启动状态 UI
   * @param isLaunching 是否正在启动
   */
  setLaunchingState(isLaunching) {
    if (isLaunching) {
      this.launchButton.classList.add("loading");
      this.launchButton.disabled = true;
      this.startButton.classList.add("disabled");
      this.startButtonText.textContent = "启动中...";
    } else {
      this.launchButton.classList.remove("loading");
      this.launchButton.disabled = false;
      this.startButton.classList.remove("disabled");
      this.startButtonText.textContent = "运行中";
    }
  }
  /**
   * 加载版本信息
   */
  loadVersionInfo() {
    try {
      const electronAPI = window.electronAPI;
      if (electronAPI?.getComfyUIVersion) {
        const version = electronAPI.getComfyUIVersion();
        const versionElement = document.getElementById("comfyui-version");
        if (versionElement) {
          versionElement.textContent = version || "未知";
        }
      }
      if (electronAPI?.getPlatform) {
        const platform = electronAPI.getPlatform();
        const platformElement = document.getElementById("activation-platform");
        if (platformElement) {
          const platformMap = {
            darwin: "macOS",
            win32: "Windows",
            linux: "Linux"
          };
          platformElement.textContent = platformMap[platform] || platform;
        }
      }
    } catch (error) {
      console.error("Failed to load version info:", error);
    }
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new LauncherApp();
  });
} else {
  new LauncherApp();
}
//# sourceMappingURL=launcher.cjs.map
