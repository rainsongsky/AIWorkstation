/**
 * Launcher IPC handlers
 * Handles window control, folder opening, and ComfyUI startup from the launcher
 */
import { BrowserWindow, shell } from 'electron';
import log from 'electron-log/main';
import path from 'node:path';

import { strictIpcMain as ipcMain } from '@/infrastructure/ipcChannels';

import { IPC_CHANNELS } from '../constants';

/**
 * Register launcher-specific IPC handlers
 * @param getWindow Function to get the main browser window
 * @param getBasePath Function to get the ComfyUI base path
 * @param startComfyUI Function to start ComfyUI and return the URL
 */
export function registerLauncherHandlers(
  getWindow: () => BrowserWindow | undefined,
  getBasePath: () => string | undefined,
  startComfyUI: () => Promise<{ url: string } | void>
) {
  /**
   * Handle window control actions (minimize, maximize, close)
   */
  ipcMain.handle(IPC_CHANNELS.LAUNCHER_WINDOW_CONTROL, (_event, action: 'minimize' | 'maximize' | 'close') => {
    const window = getWindow();
    if (!window) {
      log.error('Cannot control window: window is undefined');
      return;
    }

    log.info(`Launcher window control: ${action}`);

    switch (action) {
      case 'minimize':
        window.minimize();
        break;
      case 'maximize':
        if (window.isMaximized()) {
          window.unmaximize();
        } else {
          window.maximize();
        }
        break;
      case 'close':
        window.close();
        break;
      default:
        log.warn(`Unknown window control action: ${action}`);
    }
  });

  /**
   * Handle opening folders in the system file explorer
   */
  ipcMain.handle(IPC_CHANNELS.LAUNCHER_OPEN_FOLDER, async (_event, folderKey: string) => {
    const basePath = getBasePath();
    if (!basePath) {
      log.error('Cannot open folder: base path is undefined');
      throw new Error('Base path is not available');
    }

    let folderPath: string;

    switch (folderKey) {
      case 'root':
        folderPath = basePath;
        break;
      case 'custom_nodes':
        folderPath = path.join(basePath, 'custom_nodes');
        break;
      case 'input':
        folderPath = path.join(basePath, 'input');
        break;
      case 'output':
        folderPath = path.join(basePath, 'output');
        break;
      default:
        log.warn(`Unknown folder key: ${folderKey}`);
        throw new Error(`Unknown folder key: ${folderKey}`);
    }

    log.info(`Opening folder: ${folderPath}`);

    try {
      const result = await shell.openPath(folderPath);
      if (result) {
        // openPath returns a string with an error message if it fails
        log.error(`Failed to open folder: ${result}`);
        throw new Error(`Failed to open folder: ${result}`);
      }
    } catch (error) {
      log.error('Error opening folder:', error);
      throw error;
    }
  });

  /**
   * Handle starting ComfyUI from the launcher
   */
  // @ts-expect-error - Electron's IPC type definitions are overly restrictive. Handlers can return any serializable value.
  ipcMain.handle(IPC_CHANNELS.LAUNCHER_START_COMFYUI, async () => {
    log.info('Launcher: Starting ComfyUI...');

    try {
      // Start ComfyUI in the background
      const result = await startComfyUI();
      log.info('Launcher: ComfyUI started successfully', result);
      log.info('Launcher: Result type:', typeof result);
      log.info('Launcher: Result is object:', typeof result === 'object' && result !== null);
      log.info(
        'Launcher: Result has url property:',
        result !== undefined && typeof result === 'object' && 'url' in result
      );

      // Return the URL so the launcher can open it in a new tab
      // The URL will be constructed by the startComfyUI function
      // We need to get it from the server args
      log.info('Launcher: About to return result:', JSON.stringify(result));
      return result;
    } catch (error) {
      log.error('Launcher: Failed to start ComfyUI:', error);
      throw error;
    }
  });

  log.info('Launcher IPC handlers registered');
}
