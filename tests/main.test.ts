import { DEFAULT_SETTINGS, VIEW_TYPE_CLAUDE_AGENT } from '../src/types';

// Mock fs for ClaudeAgentService
jest.mock('fs');

// Now import the plugin after mocking
import ClaudeAgentPlugin from '../src/main';

describe('ClaudeAgentPlugin', () => {
  let plugin: ClaudeAgentPlugin;
  let mockApp: any;
  let mockManifest: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    mockApp = {
      vault: {
        adapter: {
          basePath: '/test/vault',
        },
      },
      workspace: {
        getLeavesOfType: jest.fn().mockReturnValue([]),
        getRightLeaf: jest.fn().mockReturnValue({
          setViewState: jest.fn().mockResolvedValue(undefined),
        }),
        revealLeaf: jest.fn(),
      },
    };

    mockManifest = {
      id: 'obsidian-claude-agent',
      name: 'Claude Agent',
      version: '0.1.0',
    };

    // Create plugin instance with mocked app
    plugin = new ClaudeAgentPlugin(mockApp, mockManifest);
    (plugin.loadData as jest.Mock).mockResolvedValue({});
  });

  describe('onload', () => {
    it('should initialize settings with defaults', async () => {
      await plugin.onload();

      expect(plugin.settings).toBeDefined();
      expect(plugin.settings.enableBlocklist).toBe(DEFAULT_SETTINGS.enableBlocklist);
      expect(plugin.settings.showToolUse).toBe(DEFAULT_SETTINGS.showToolUse);
      expect(plugin.settings.blockedCommands).toEqual(DEFAULT_SETTINGS.blockedCommands);
    });

    it('should initialize agentService', async () => {
      await plugin.onload();

      expect(plugin.agentService).toBeDefined();
    });

    it('should register the view', async () => {
      await plugin.onload();

      expect((plugin.registerView as jest.Mock)).toHaveBeenCalledWith(
        VIEW_TYPE_CLAUDE_AGENT,
        expect.any(Function)
      );
    });

    it('should add ribbon icon', async () => {
      await plugin.onload();

      expect((plugin.addRibbonIcon as jest.Mock)).toHaveBeenCalledWith(
        'bot',
        'Open Claude Agent',
        expect.any(Function)
      );
    });

    it('should add command to open view', async () => {
      await plugin.onload();

      expect((plugin.addCommand as jest.Mock)).toHaveBeenCalledWith({
        id: 'open-claude-agent',
        name: 'Open Claude Agent',
        callback: expect.any(Function),
      });
    });

    it('should add settings tab', async () => {
      await plugin.onload();

      expect((plugin.addSettingTab as jest.Mock)).toHaveBeenCalled();
    });
  });

  describe('onunload', () => {
    it('should call cleanup on agentService', async () => {
      await plugin.onload();

      const cleanupSpy = jest.spyOn(plugin.agentService, 'cleanup');

      plugin.onunload();

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  describe('activateView', () => {
    it('should reveal existing leaf if view already exists', async () => {
      const mockLeaf = { id: 'existing-leaf' };
      mockApp.workspace.getLeavesOfType.mockReturnValue([mockLeaf]);

      await plugin.onload();
      await plugin.activateView();

      expect(mockApp.workspace.revealLeaf).toHaveBeenCalledWith(mockLeaf);
    });

    it('should create new leaf in right sidebar if view does not exist', async () => {
      const mockRightLeaf = {
        setViewState: jest.fn().mockResolvedValue(undefined),
      };
      mockApp.workspace.getLeavesOfType.mockReturnValue([]);
      mockApp.workspace.getRightLeaf.mockReturnValue(mockRightLeaf);

      await plugin.onload();
      await plugin.activateView();

      expect(mockApp.workspace.getRightLeaf).toHaveBeenCalledWith(false);
      expect(mockRightLeaf.setViewState).toHaveBeenCalledWith({
        type: VIEW_TYPE_CLAUDE_AGENT,
        active: true,
      });
    });

    it('should handle null right leaf gracefully', async () => {
      mockApp.workspace.getLeavesOfType.mockReturnValue([]);
      mockApp.workspace.getRightLeaf.mockReturnValue(null);

      await plugin.onload();

      // Should not throw
      await expect(plugin.activateView()).resolves.not.toThrow();
    });
  });

  describe('loadSettings', () => {
    it('should merge saved data with defaults', async () => {
      (plugin.loadData as jest.Mock).mockResolvedValue({
        enableBlocklist: false,
        showToolUse: false,
      });

      await plugin.loadSettings();

      expect(plugin.settings.enableBlocklist).toBe(false);
      expect(plugin.settings.showToolUse).toBe(false);
      // Should still have defaults for blockedCommands
      expect(plugin.settings.blockedCommands).toEqual(DEFAULT_SETTINGS.blockedCommands);
    });

    it('should use defaults when no saved data', async () => {
      (plugin.loadData as jest.Mock).mockResolvedValue(null);

      await plugin.loadSettings();

      expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should use defaults when loadData returns empty object', async () => {
      (plugin.loadData as jest.Mock).mockResolvedValue({});

      await plugin.loadSettings();

      expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('saveSettings', () => {
    it('should call saveData with current settings', async () => {
      await plugin.onload();

      plugin.settings.enableBlocklist = false;
      plugin.settings.showToolUse = false;

      await plugin.saveSettings();

      expect((plugin.saveData as jest.Mock)).toHaveBeenCalledWith(plugin.settings);
    });
  });

  describe('ribbon icon callback', () => {
    it('should call activateView when ribbon icon is clicked', async () => {
      await plugin.onload();

      // Get the callback passed to addRibbonIcon
      const ribbonCallback = (plugin.addRibbonIcon as jest.Mock).mock.calls[0][2];
      const activateViewSpy = jest.spyOn(plugin, 'activateView');

      ribbonCallback();

      expect(activateViewSpy).toHaveBeenCalled();
    });
  });

  describe('command callback', () => {
    it('should call activateView when command is executed', async () => {
      await plugin.onload();

      // Get the callback passed to addCommand
      const commandConfig = (plugin.addCommand as jest.Mock).mock.calls[0][0];
      const activateViewSpy = jest.spyOn(plugin, 'activateView');

      commandConfig.callback();

      expect(activateViewSpy).toHaveBeenCalled();
    });
  });
});
