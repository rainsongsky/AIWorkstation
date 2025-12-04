import { app, dialog } from 'electron';
import log from 'electron-log/main';

import { strictIpcMain as ipcMain } from '@/infrastructure/ipcChannels';

import { ProgressStatus, type ServerArgs } from './constants';
import { IPC_CHANNELS } from './constants';
import { InstallStage } from './constants';
import { registerAppHandlers } from './handlers/AppHandlers';
import { registerAppInfoHandlers } from './handlers/appInfoHandlers';
import { registerGpuHandlers } from './handlers/gpuHandlers';
import { registerInstallStateHandlers } from './handlers/installStateHandlers';
import { registerLauncherHandlers } from './handlers/launcherHandlers';
import { registerNetworkHandlers } from './handlers/networkHandlers';
import { registerPathHandlers } from './handlers/pathHandlers';
import { FatalError } from './infrastructure/fatalError';
import type { FatalErrorOptions } from './infrastructure/interfaces';
import { createProcessCallbacks } from './install/createProcessCallbacks';
import { InstallationManager } from './install/installationManager';
import { Troubleshooting } from './install/troubleshooting';
import type { IAppState } from './main-process/appState';
import { useAppState } from './main-process/appState';
import { AppWindow } from './main-process/appWindow';
import { ComfyDesktopApp } from './main-process/comfyDesktopApp';
import type { ComfyInstallation } from './main-process/comfyInstallation';
import { DevOverrides } from './main-process/devOverrides';
import { createInstallStageInfo } from './main-process/installStages';
import SentryLogging from './services/sentry';
import { type HasTelemetry, type ITelemetry, getTelemetry, promptMetricsConsent } from './services/telemetry';
import { DesktopConfig } from './store/desktopConfig';

export class DesktopApp implements HasTelemetry {
  readonly telemetry: ITelemetry = getTelemetry();
  readonly appState: IAppState = useAppState();
  readonly appWindow: AppWindow;

  comfyDesktopApp?: ComfyDesktopApp;
  installation?: ComfyInstallation;

  constructor(
    private readonly overrides: DevOverrides,
    private readonly config: DesktopConfig
  ) {
    this.appWindow = new AppWindow(
      overrides.DEV_SERVER_URL,
      overrides.DEV_FRONTEND_URL,
      overrides.DEV_TOOLS_AUTO === 'true'
    );
  }

  /** Load launcher screen - custom UI for starting ComfyUI */
  async showLoadingPage() {
    try {
      this.appState.setInstallStage(createInstallStageInfo(InstallStage.APP_INITIALIZING, { progress: 1 }));
      await this.appWindow.loadLauncher();
    } catch (error) {
      DesktopApp.fatalError({
        error,
        message: `Unknown error whilst loading launcher screen.\n\n${error}`,
        title: 'Startup failed',
      });
    }
  }

  private async initializeTelemetry(installation: ComfyInstallation): Promise<void> {
    await SentryLogging.setSentryGpuContext();
    SentryLogging.getBasePath = () => installation.basePath;

    const allowMetrics = await promptMetricsConsent(this.config, this.appWindow);
    this.telemetry.hasConsent = allowMetrics;
    if (allowMetrics) this.telemetry.flush();
  }

  /**
   * Install / validate installation is complete
   * @returns The installation if it is complete, otherwise `undefined` (error page).
   * @throws Rethrows any errors when the installation fails before the app has set the current page.
   */
  private async initializeInstallation(): Promise<ComfyInstallation | undefined> {
    const { appWindow } = this;
    try {
      const installManager = new InstallationManager(appWindow, this.telemetry);
      return await installManager.ensureInstalled();
    } catch (error) {
      // Don't force app quit if the error occurs after moving away from the start page.
      if (this.appState.currentPage !== 'desktop-start') {
        appWindow.sendServerStartProgress(ProgressStatus.ERROR);
        appWindow.send(IPC_CHANNELS.LOG_MESSAGE, `${error}\n`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Initialize the app for launcher mode
   * This prepares the installation but doesn't start the ComfyUI server
   * The server will be started when the user clicks the launch button
   */
  async initializeForLauncher(): Promise<void> {
    const { appState } = this;

    if (!appState.ipcRegistered) this.registerIpcHandlers();

    appState.setInstallStage(createInstallStageInfo(InstallStage.CHECKING_EXISTING_INSTALL, { progress: 2 }));
    const installation = await this.initializeInstallation();
    if (!installation) return;
    this.installation = installation;

    // At this point, user has gone through the onboarding flow.
    await this.initializeTelemetry(installation);

    log.info('Launcher initialized and ready. Waiting for user to start ComfyUI...');
  }

  async start(): Promise<{ url: string } | void> {
    const { appState, appWindow, overrides, telemetry } = this;

    // If not yet registered, register IPC handlers
    if (!appState.ipcRegistered) this.registerIpcHandlers();

    // If installation is not yet complete, initialize it
    if (!this.installation) {
      appState.setInstallStage(createInstallStageInfo(InstallStage.CHECKING_EXISTING_INSTALL, { progress: 2 }));
      const installation = await this.initializeInstallation();
      if (!installation) return;
      this.installation = installation;

      // At this point, user has gone through the onboarding flow.
      await this.initializeTelemetry(installation);
    }

    try {
      // Initialize app
      this.comfyDesktopApp ??= new ComfyDesktopApp(this.installation, appWindow, telemetry);
      const { comfyDesktopApp } = this;

      // Short circuit if server is already running - return the existing server's URL
      if (comfyDesktopApp.serverRunning && comfyDesktopApp.comfyServer) {
        log.info('ComfyUI server is already running, returning existing URL');
        const host =
          comfyDesktopApp.comfyServer.serverArgs.listen === '0.0.0.0'
            ? 'localhost'
            : comfyDesktopApp.comfyServer.serverArgs.listen;
        const url = overrides.DEV_FRONTEND_URL ?? `http://${host}:${comfyDesktopApp.comfyServer.serverArgs.port}`;
        appWindow.sendServerStartProgress(ProgressStatus.READY);
        appState.setInstallStage(createInstallStageInfo(InstallStage.READY, { progress: 100 }));
        appState.emitLoaded();
        return { url };
      }

      // Construct core launch args
      const serverArgs = await comfyDesktopApp.buildServerArgs(overrides);

      // Build the URL for ComfyUI
      const host = serverArgs.listen === '0.0.0.0' ? 'localhost' : serverArgs.listen;
      const url = overrides.DEV_FRONTEND_URL ?? `http://${host}:${serverArgs.port}`;

      // Short circuit if using external server
      if (overrides.useExternalServer) {
        // Don't load frontend in the launcher window, just set state
        appWindow.sendServerStartProgress(ProgressStatus.READY);
        appState.setInstallStage(createInstallStageInfo(InstallStage.READY, { progress: 100 }));
        appState.emitLoaded();
        return { url };
      }

      // Start server
      try {
        await startComfyServer(comfyDesktopApp, serverArgs);
        // Don't load frontend in the launcher window, just set state
        appWindow.sendServerStartProgress(ProgressStatus.READY);
        appState.setInstallStage(createInstallStageInfo(InstallStage.READY, { progress: 100 }));
        appState.emitLoaded();
        return { url };
      } catch (error) {
        // If there is a module import error, offer to try and recreate the venv.
        const lastError = comfyDesktopApp.comfyServer?.parseLastError();
        if (lastError === 'ModuleNotFoundError') {
          const shouldReinstallVenv = await getUserApprovalToReinstallVenv();

          if (shouldReinstallVenv) {
            // User chose to reinstall - remove venv and retry
            log.info('User chose to reinstall venv after import verification failure');

            const { virtualEnvironment } = this.installation;
            const removed = await virtualEnvironment.removeVenvDirectory();
            if (!removed) throw new Error('Failed to remove .venv directory');

            try {
              await virtualEnvironment.create(createProcessCallbacks(appWindow, { logStderrAsInfo: true }));
              await startComfyServer(comfyDesktopApp, serverArgs);
              appWindow.sendServerStartProgress(ProgressStatus.READY);
              appState.setInstallStage(createInstallStageInfo(InstallStage.READY, { progress: 100 }));
              appState.emitLoaded();
              return { url };
            } catch (error) {
              showStartupErrorPage(error);
            }
          }
        }

        showStartupErrorPage(error);
      }
    } catch (error) {
      log.error('Unhandled exception during app startup', error);
      appState.setInstallStage(createInstallStageInfo(InstallStage.ERROR, { error: String(error) }));
      appWindow.sendServerStartProgress(ProgressStatus.ERROR);
      appWindow.send(IPC_CHANNELS.LOG_MESSAGE, `${error}\n`);
      if (!this.appState.isQuitting) {
        dialog.showErrorBox(
          'Unhandled exception',
          `An unexpected error occurred whilst starting the app, and it needs to be closed.\n\nError message:\n\n${error}`
        );
        app.quit();
      }
    }

    /**
     * Shows a dialog to the user asking if they want to reinstall the venv.
     * @returns The result of the dialog.
     */
    async function getUserApprovalToReinstallVenv(): Promise<boolean> {
      const { response } = await appWindow.showMessageBox({
        type: 'error',
        title: 'Python Environment Issue',
        message:
          'Missing Python Module\n\n' +
          'We were unable to import at least one required Python module.\n\n' +
          'Would you like to remove and reinstall the venv?',
        buttons: ['Reset Virtual Environment', 'Ignore'],
        defaultId: 0,
        cancelId: 1,
      });
      return response === 0;
    }

    /**
     * Shows the starting server page and starts the ComfyUI server.
     * @param comfyDesktopApp The comfy desktop app instance.
     * @param serverArgs The server args to use to start the server.
     */
    async function startComfyServer(comfyDesktopApp: ComfyDesktopApp, serverArgs: ServerArgs): Promise<void> {
      appState.setInstallStage(createInstallStageInfo(InstallStage.STARTING_SERVER));
      // Skip page load when launching from launcher - keep the launcher window visible
      await comfyDesktopApp.startComfyServer(serverArgs, true);
    }

    /**
     * Shows the startup error page and sets the app state to error.
     * @param error The error to show the startup error page for.
     */
    function showStartupErrorPage(error: unknown): void {
      log.error('Unhandled exception during server start', error);
      appWindow.send(IPC_CHANNELS.LOG_MESSAGE, `${error}\n`);
      appWindow.sendServerStartProgress(ProgressStatus.ERROR);
      appState.setInstallStage(createInstallStageInfo(InstallStage.ERROR, { progress: 0, error: String(error) }));
    }
  }

  private registerIpcHandlers() {
    this.appState.emitIpcRegistered();

    try {
      // Register basic handlers that are necessary during app's installation.
      registerPathHandlers();
      registerNetworkHandlers();
      registerAppInfoHandlers();
      registerAppHandlers();
      registerGpuHandlers();
      registerInstallStateHandlers();

      // Register launcher-specific handlers
      registerLauncherHandlers(
        () => this.appWindow['window'],
        () => this.installation?.basePath,
        async () => await this.start()
      );

      ipcMain.handle(IPC_CHANNELS.START_TROUBLESHOOTING, async () => await this.showTroubleshootingPage());
    } catch (error) {
      DesktopApp.fatalError({
        error,
        message: 'Fatal error occurred during app pre-startup.',
        title: 'Startup failed',
        exitCode: 2024,
      });
    }
  }

  async showTroubleshootingPage() {
    try {
      if (!this.installation) throw new Error('Cannot troubleshoot before installation is complete.');
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      using troubleshooting = new Troubleshooting(this.installation, this.appWindow);

      if (!this.appState.loaded) {
        await this.appWindow.loadPage('maintenance');
      }
      // @ts-expect-error API says this should return false; always treated as falsy.
      await new Promise((resolve) => ipcMain.handleOnce(IPC_CHANNELS.COMPLETE_VALIDATION, resolve));
    } catch (error) {
      DesktopApp.fatalError({
        error,
        message: `An error was detected, but the troubleshooting page could not be loaded. The app will close now. Please reinstall if this issue persists.`,
        title: 'Critical error',
        exitCode: 2001,
      });
    }

    await this.start();
  }

  /**
   * Quits the app gracefully after a fatal error.  Exits immediately if a code is provided.
   *
   * Logs the error and shows an error dialog to the user.
   * @param options - The options for the error.
   */
  static fatalError({ message, error, title, logMessage, exitCode }: FatalErrorOptions): never {
    const _error = FatalError.wrapIfGeneric(error);
    log.error(logMessage ?? message, _error);
    if (title && message) dialog.showErrorBox(title, message);

    if (exitCode) app.exit(exitCode);
    else app.quit();
    // Unreachable - library type is void instead of never.
    throw _error;
  }
}
