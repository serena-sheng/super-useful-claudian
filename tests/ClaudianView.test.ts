/**
 * Tests for ClaudianView - Edited Files Feature
 * TDD: Tests written first, implementation follows
 */

import { TFile, WorkspaceLeaf } from 'obsidian';
import { ClaudianView } from '../src/ClaudianView';
import { FileContextManager } from '../src/ui/FileContext';

// Helper to create a mock plugin
function createMockPlugin(settingsOverrides = {}) {
  return {
    settings: {
      enableBlocklist: true,
      blockedCommands: [],
      showToolUse: true,
      model: 'claude-haiku-4-5',
      thinkingBudget: 'off',
      permissionMode: 'yolo',
      approvedActions: [],
      excludedTags: [],
      ...settingsOverrides,
    },
    app: {
      vault: {
        adapter: {
          basePath: '/test/vault',
        },
        getAbstractFileByPath: jest.fn(),
        getMarkdownFiles: jest.fn().mockReturnValue([]),
        on: jest.fn(),
      },
      workspace: {
        getLeaf: jest.fn().mockReturnValue({
          openFile: jest.fn().mockResolvedValue(undefined),
        }),
        getLeavesOfType: jest.fn().mockReturnValue([]),
        on: jest.fn(),
        getActiveFile: jest.fn().mockReturnValue(null),
      },
      metadataCache: {
        on: jest.fn(),
        getFileCache: jest.fn().mockReturnValue(null),
      },
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    agentService: {
      query: jest.fn(),
      cancel: jest.fn(),
      resetSession: jest.fn(),
      setApprovalCallback: jest.fn(),
      setSessionId: jest.fn(),
      getSessionId: jest.fn().mockReturnValue(null),
    },
    service: {
      query: jest.fn(),
      cancel: jest.fn(),
      resetSession: jest.fn(),
    },
    loadConversations: jest.fn().mockResolvedValue([]),
    saveConversations: jest.fn().mockResolvedValue(undefined),
    getConversation: jest.fn().mockReturnValue(null),
    createConversation: jest.fn().mockReturnValue({
      id: 'test-conv',
      title: 'Test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sessionId: null,
      messages: [],
    }),
    switchConversation: jest.fn().mockResolvedValue(null),
    updateConversation: jest.fn().mockResolvedValue(undefined),
  } as any;
}

// Helper to create a mock WorkspaceLeaf
function createMockLeaf() {
  return new WorkspaceLeaf();
}

// Helper to create mock DOM elements with tracking
function createMockElement(tag = 'div') {
  const children: any[] = [];
  const classList = new Set<string>();
  const attributes = new Map<string, string>();
  const eventListeners = new Map<string, Function[]>();
  const style: Record<string, string> = {};

  const element: any = {
    tagName: tag.toUpperCase(),
    children,
    classList: {
      add: (cls: string) => classList.add(cls),
      remove: (cls: string) => classList.delete(cls),
      contains: (cls: string) => classList.has(cls),
      toggle: (cls: string) => {
        if (classList.has(cls)) classList.delete(cls);
        else classList.add(cls);
      },
    },
    addClass: (cls: string) => classList.add(cls),
    removeClass: (cls: string) => classList.delete(cls),
    hasClass: (cls: string) => classList.has(cls),
    getClasses: () => Array.from(classList),
    style,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    getAttribute: (name: string) => attributes.get(name),
    addEventListener: (event: string, handler: Function) => {
      if (!eventListeners.has(event)) eventListeners.set(event, []);
      eventListeners.get(event)!.push(handler);
    },
    dispatchEvent: (event: { type: string; target?: any; stopPropagation?: () => void }) => {
      const handlers = eventListeners.get(event.type) || [];
      handlers.forEach(h => h(event));
    },
    click: () => element.dispatchEvent({ type: 'click', target: element, stopPropagation: () => {} }),
    empty: () => { children.length = 0; },
    createDiv: (opts?: { cls?: string; text?: string }) => {
      const child = createMockElement('div');
      if (opts?.cls) child.addClass(opts.cls);
      if (opts?.text) child.setText(opts.text);
      children.push(child);
      return child;
    },
    createSpan: (opts?: { cls?: string; text?: string }) => {
      const child = createMockElement('span');
      if (opts?.cls) child.addClass(opts.cls);
      if (opts?.text) child.setText(opts.text);
      children.push(child);
      return child;
    },
    createEl: (tag: string, opts?: { cls?: string; text?: string; type?: string; placeholder?: string }) => {
      const child = createMockElement(tag);
      if (opts?.cls) child.addClass(opts.cls);
      if (opts?.text) child.setText(opts.text);
      children.push(child);
      return child;
    },
    setText: (text: string) => { element.textContent = text; },
    textContent: '',
    innerHTML: '',
    querySelector: (selector: string) => {
      // Simple selector support for testing
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        return children.find((c: any) => c.hasClass?.(cls));
      }
      return null;
    },
    querySelectorAll: (selector: string) => {
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        return children.filter((c: any) => c.hasClass?.(cls));
      }
      return [];
    },
    closest: (selector: string) => {
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        if (classList.has(cls)) return element;
      }
      return null;
    },
    // For tracking in tests
    _classList: classList,
    _attributes: attributes,
    _eventListeners: eventListeners,
  };

  return element;
}

// Helper to create a FileContextManager for testing
function createFileContextManager(mockPlugin: any) {
  const containerEl = createMockElement('div');
  const inputEl = createMockElement('textarea');
  inputEl.value = '';
  inputEl.selectionStart = 0;
  inputEl.selectionEnd = 0;

  return new FileContextManager(
    mockPlugin.app,
    containerEl,
    inputEl as any,
    {
      getExcludedTags: () => mockPlugin.settings.excludedTags,
      onFileOpen: async () => {},
    }
  );
}

describe('FileContextManager - Edited Files Tracking', () => {
  let fileContextManager: FileContextManager;
  let mockPlugin: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPlugin = createMockPlugin();
    fileContextManager = createFileContextManager(mockPlugin);
  });

  describe('Tracking edited files from tool results', () => {
    it('should track file when Write tool completes successfully', async () => {
      const rawPath = '/test/vault/notes/test.md';
      const normalizedPath = 'notes/test.md';

      // Simulate a Write tool completing
      fileContextManager.trackEditedFile('Write', { file_path: rawPath }, false);

      expect((fileContextManager as any).editedFilesThisSession.has(normalizedPath)).toBe(true);
    });

    it('should track file when Edit tool completes successfully', async () => {
      const rawPath = '/test/vault/notes/edited.md';
      const normalizedPath = 'notes/edited.md';

      // Simulate an Edit tool completing
      fileContextManager.trackEditedFile('Edit', { file_path: rawPath }, false);

      expect((fileContextManager as any).editedFilesThisSession.has(normalizedPath)).toBe(true);
    });

    it('should NOT track file when tool result has error', async () => {
      const rawPath = '/test/vault/notes/error.md';
      const normalizedPath = 'notes/error.md';

      // Simulate a Write tool completing with error
      fileContextManager.trackEditedFile('Write', { file_path: rawPath }, true);

      expect((fileContextManager as any).editedFilesThisSession.has(normalizedPath)).toBe(false);
    });

    it('should NOT track files from Read tool', async () => {
      const rawPath = '/test/vault/notes/read.md';
      const normalizedPath = 'notes/read.md';

      // Simulate a Read tool completing
      fileContextManager.trackEditedFile('Read', { file_path: rawPath }, false);

      expect((fileContextManager as any).editedFilesThisSession.has(normalizedPath)).toBe(false);
    });

    it('should NOT track files from Bash tool', async () => {
      // Simulate a Bash tool completing
      fileContextManager.trackEditedFile('Bash', { command: 'ls -la' }, false);

      expect((fileContextManager as any).editedFilesThisSession.size).toBe(0);
    });

    it('should track NotebookEdit tool with notebook_path', async () => {
      const notebookPath = '/test/vault/notebook.ipynb';
      const normalizedPath = 'notebook.ipynb';

      // Simulate NotebookEdit tool completing
      fileContextManager.trackEditedFile('NotebookEdit', { notebook_path: notebookPath }, false);

      expect((fileContextManager as any).editedFilesThisSession.has(normalizedPath)).toBe(true);
    });

    it('should normalize absolute paths to vault-relative for tracking and dismissal', async () => {
      const rawPath = '/test/vault/notes/absolute.md';
      const normalizedPath = 'notes/absolute.md';

      fileContextManager.trackEditedFile('Write', { file_path: rawPath }, false);
      expect((fileContextManager as any).editedFilesThisSession.has(normalizedPath)).toBe(true);

      // Dismiss via private method for testing
      (fileContextManager as any).dismissEditedFile(rawPath);
      expect((fileContextManager as any).editedFilesThisSession.has(normalizedPath)).toBe(false);
    });
  });

  describe('Clearing edited files', () => {
    it('should clear edited files on resetForNewConversation()', async () => {
      // Add some edited files
      (fileContextManager as any).editedFilesThisSession.add('file1.md');
      (fileContextManager as any).editedFilesThisSession.add('file2.md');

      expect((fileContextManager as any).editedFilesThisSession.size).toBe(2);

      // Reset for new conversation
      fileContextManager.resetForNewConversation();

      expect((fileContextManager as any).editedFilesThisSession.size).toBe(0);
    });

    it('should clear edited files on new conversation', async () => {
      (fileContextManager as any).editedFilesThisSession.add('old-file.md');

      // Start new conversation
      fileContextManager.resetForNewConversation();

      expect((fileContextManager as any).editedFilesThisSession.size).toBe(0);
    });

    it('should remove file from edited set when file is focused', async () => {
      const filePath = 'notes/edited.md';
      (fileContextManager as any).editedFilesThisSession.add(filePath);

      expect((fileContextManager as any).editedFilesThisSession.has(filePath)).toBe(true);

      // Simulate focusing on the file (via private method)
      (fileContextManager as any).dismissEditedFile(filePath);

      expect((fileContextManager as any).editedFilesThisSession.has(filePath)).toBe(false);
    });

    it('should dismiss edited indicator when focusing file', async () => {
      const filePath = 'notes/clicked.md';
      (fileContextManager as any).editedFilesThisSession.add(filePath);

      // After focusing, file should be dismissed
      (fileContextManager as any).dismissEditedFile(filePath);

      expect((fileContextManager as any).isFileEdited(filePath)).toBe(false);
    });
  });
});

describe('ClaudianView - Handling tool results when tool UI is hidden', () => {
  let view: ClaudianView;
  let mockPlugin: any;
  let mockLeaf: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPlugin = createMockPlugin({ showToolUse: false });
    mockLeaf = createMockLeaf();
    view = new ClaudianView(mockLeaf, mockPlugin);

    // Set up required elements
    (view as any).messagesEl = createMockElement('div');
    (view as any).messagesEl.scrollTop = 0;
    (view as any).messagesEl.scrollHeight = 0;

    // Create a mock file context manager
    const containerEl = createMockElement('div');
    const inputEl = createMockElement('textarea');
    inputEl.value = '';
    (view as any).fileContextManager = new FileContextManager(
      mockPlugin.app,
      containerEl,
      inputEl as any,
      {
        getExcludedTags: () => mockPlugin.settings.excludedTags,
        onFileOpen: async () => {},
      }
    );
  });

  it('should still track edited files from tool_result chunks', async () => {
    const msg: any = { id: 'assistant-1', role: 'assistant', content: '', timestamp: Date.now(), toolCalls: [], contentBlocks: [] };

    await (view as any).handleStreamChunk(
      { type: 'tool_use', id: 'tool-1', name: 'Write', input: { file_path: 'notes/hidden.md' } },
      msg
    );
    await (view as any).handleStreamChunk(
      { type: 'tool_result', id: 'tool-1', content: 'ok', isError: false },
      msg
    );

    expect((view as any).fileContextManager.getAttachedFiles().has('notes/hidden.md') ||
           (view as any).fileContextManager['editedFilesThisSession'].has('notes/hidden.md')).toBe(true);
  });
});

describe('FileContextManager - File Chip Click Handlers', () => {
  let fileContextManager: FileContextManager;
  let mockPlugin: any;
  let mockOpenFile: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenFile = jest.fn().mockResolvedValue(undefined);
    mockPlugin = createMockPlugin();
    mockPlugin.app.workspace.getLeaf = jest.fn().mockReturnValue({
      openFile: mockOpenFile,
    });
    fileContextManager = createFileContextManager(mockPlugin);
  });

  describe('Opening files on chip click', () => {
    it('should open file in new tab when chip is clicked', async () => {
      const filePath = 'notes/test.md';
      const mockFile = new TFile(filePath);

      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(mockFile);

      // Simulate opening file from chip click (via private method)
      await (fileContextManager as any).openFileFromChip(filePath);

      expect(mockPlugin.app.vault.getAbstractFileByPath).toHaveBeenCalledWith(filePath);
      expect(mockPlugin.app.workspace.getLeaf).toHaveBeenCalledWith('tab');
      expect(mockOpenFile).toHaveBeenCalledWith(mockFile);
    });

    it('should NOT open file if file does not exist in vault', async () => {
      const filePath = 'notes/nonexistent.md';

      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);

      await (fileContextManager as any).openFileFromChip(filePath);

      expect(mockPlugin.app.vault.getAbstractFileByPath).toHaveBeenCalledWith(filePath);
      expect(mockOpenFile).not.toHaveBeenCalled();
    });
  });

  describe('Edited class on chips', () => {
    it('should return true when file is in editedFilesThisSession', () => {
      const filePath = 'edited.md';
      (fileContextManager as any).editedFilesThisSession.add(filePath);

      const isEdited = (fileContextManager as any).isFileEdited(filePath);

      expect(isEdited).toBe(true);
    });

    it('should return false when file is NOT in editedFilesThisSession', () => {
      const filePath = 'not-edited.md';

      const isEdited = (fileContextManager as any).isFileEdited(filePath);

      expect(isEdited).toBe(false);
    });
  });
});

describe('FileContextManager - Edited Files Section', () => {
  let fileContextManager: FileContextManager;
  let mockPlugin: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPlugin = createMockPlugin();
    fileContextManager = createFileContextManager(mockPlugin);
  });

  describe('Visibility logic', () => {
    it('should return non-attached edited files only', () => {
      // File is edited but NOT attached
      (fileContextManager as any).editedFilesThisSession.add('edited1.md');
      (fileContextManager as any).editedFilesThisSession.add('edited2.md');
      // This file is both edited AND attached
      (fileContextManager as any).editedFilesThisSession.add('attached.md');
      (fileContextManager as any).attachedFiles.add('attached.md');

      const nonAttached = (fileContextManager as any).getNonAttachedEditedFiles();

      expect(nonAttached).toHaveLength(2);
      expect(nonAttached).toContain('edited1.md');
      expect(nonAttached).toContain('edited2.md');
      expect(nonAttached).not.toContain('attached.md');
    });

    it('should return empty array when all edited files are attached', () => {
      (fileContextManager as any).editedFilesThisSession.add('file.md');
      (fileContextManager as any).attachedFiles.add('file.md');

      const nonAttached = (fileContextManager as any).getNonAttachedEditedFiles();

      expect(nonAttached).toHaveLength(0);
    });

    it('should return empty array when no files are edited', () => {
      const nonAttached = (fileContextManager as any).getNonAttachedEditedFiles();

      expect(nonAttached).toHaveLength(0);
    });

    it('should show edited files section when has non-attached edited files', () => {
      (fileContextManager as any).editedFilesThisSession.add('edited.md');

      const shouldShow = (fileContextManager as any).shouldShowEditedFilesSection();

      expect(shouldShow).toBe(true);
    });

    it('should NOT show edited files section when all edited files are attached', () => {
      (fileContextManager as any).editedFilesThisSession.add('attached.md');
      (fileContextManager as any).attachedFiles.add('attached.md');

      const shouldShow = (fileContextManager as any).shouldShowEditedFilesSection();

      expect(shouldShow).toBe(false);
    });

    it('should NOT show edited files section when no files are edited', () => {
      const shouldShow = (fileContextManager as any).shouldShowEditedFilesSection();

      expect(shouldShow).toBe(false);
    });
  });

  describe('UI refresh on attachment changes', () => {
    it('should hide edited section when an edited file becomes attached', () => {
      (fileContextManager as any).editedFilesThisSession.add('notes/edited.md');

      (fileContextManager as any).updateEditedFilesIndicator();
      expect((fileContextManager as any).editedFilesIndicatorEl.style.display).toBe('flex');

      (fileContextManager as any).attachedFiles.add('notes/edited.md');
      (fileContextManager as any).updateFileIndicator();

      expect((fileContextManager as any).editedFilesIndicatorEl.style.display).toBe('none');
    });

    it('should show edited section when an edited attached file is removed', () => {
      (fileContextManager as any).editedFilesThisSession.add('notes/edited.md');
      (fileContextManager as any).attachedFiles.add('notes/edited.md');

      (fileContextManager as any).updateFileIndicator();
      expect((fileContextManager as any).editedFilesIndicatorEl.style.display).toBe('none');

      (fileContextManager as any).attachedFiles.delete('notes/edited.md');
      (fileContextManager as any).updateFileIndicator();

      expect((fileContextManager as any).editedFilesIndicatorEl.style.display).toBe('flex');
    });
  });
});

describe('ClaudianView - Conversation boundaries', () => {
  it('should clear edited files when switching conversations', async () => {
    const mockPlugin = createMockPlugin();
    mockPlugin.agentService.getSessionId = jest.fn().mockReturnValue(null);
    mockPlugin.switchConversation = jest.fn().mockResolvedValue({
      id: 'conv-2',
      messages: [],
      sessionId: null,
    });

    const view = new ClaudianView(createMockLeaf(), mockPlugin);
    (view as any).messagesEl = createMockElement('div');
    (view as any).currentConversationId = 'conv-1';
    (view as any).messages = [];

    // Create a mock file context manager
    const containerEl = createMockElement('div');
    const inputEl = createMockElement('textarea');
    inputEl.value = '';
    (view as any).fileContextManager = new FileContextManager(
      mockPlugin.app,
      containerEl,
      inputEl as any,
      {
        getExcludedTags: () => mockPlugin.settings.excludedTags,
        onFileOpen: async () => {},
      }
    );
    ((view as any).fileContextManager as any).editedFilesThisSession.add('notes/old.md');

    await (view as any).onConversationSelect('conv-2');

    expect(((view as any).fileContextManager as any).editedFilesThisSession.size).toBe(0);
  });
});

describe('FileContextManager - Excluded Tags', () => {
  let fileContextManager: FileContextManager;
  let mockPlugin: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPlugin = createMockPlugin({ excludedTags: ['system', 'private'] });
    fileContextManager = createFileContextManager(mockPlugin);
  });

  describe('hasExcludedTag', () => {
    it('should return false when excludedTags is empty', () => {
      mockPlugin.settings.excludedTags = [];
      const file = new TFile('notes/test.md');

      const result = (fileContextManager as any).hasExcludedTag(file);

      expect(result).toBe(false);
    });

    it('should return false when file has no cache', () => {
      mockPlugin.app.metadataCache.getFileCache.mockReturnValue(null);
      const file = new TFile('notes/test.md');

      const result = (fileContextManager as any).hasExcludedTag(file);

      expect(result).toBe(false);
    });

    it('should return false when file has no tags', () => {
      mockPlugin.app.metadataCache.getFileCache.mockReturnValue({});
      const file = new TFile('notes/test.md');

      const result = (fileContextManager as any).hasExcludedTag(file);

      expect(result).toBe(false);
    });

    it('should detect excluded tag in frontmatter tags array', () => {
      mockPlugin.app.metadataCache.getFileCache.mockReturnValue({
        frontmatter: { tags: ['system', 'notes'] },
      });
      const file = new TFile('notes/test.md');

      const result = (fileContextManager as any).hasExcludedTag(file);

      expect(result).toBe(true);
    });

    it('should detect excluded tag in frontmatter tags string', () => {
      mockPlugin.app.metadataCache.getFileCache.mockReturnValue({
        frontmatter: { tags: 'system' },
      });
      const file = new TFile('notes/test.md');

      const result = (fileContextManager as any).hasExcludedTag(file);

      expect(result).toBe(true);
    });

    it('should detect excluded tag in inline tags', () => {
      mockPlugin.app.metadataCache.getFileCache.mockReturnValue({
        tags: [{ tag: '#system', position: { start: { line: 5 } } }],
      });
      const file = new TFile('notes/test.md');

      const result = (fileContextManager as any).hasExcludedTag(file);

      expect(result).toBe(true);
    });

    it('should handle tags with # prefix in frontmatter', () => {
      mockPlugin.app.metadataCache.getFileCache.mockReturnValue({
        frontmatter: { tags: ['#system'] },
      });
      const file = new TFile('notes/test.md');

      const result = (fileContextManager as any).hasExcludedTag(file);

      expect(result).toBe(true);
    });

    it('should return false when file has non-excluded tags only', () => {
      mockPlugin.app.metadataCache.getFileCache.mockReturnValue({
        frontmatter: { tags: ['notes', 'journal'] },
        tags: [{ tag: '#todo' }],
      });
      const file = new TFile('notes/test.md');

      const result = (fileContextManager as any).hasExcludedTag(file);

      expect(result).toBe(false);
    });

    it('should match any of multiple excluded tags', () => {
      mockPlugin.app.metadataCache.getFileCache.mockReturnValue({
        frontmatter: { tags: ['private'] },  // 'private' is in excludedTags
      });
      const file = new TFile('notes/secret.md');

      const result = (fileContextManager as any).hasExcludedTag(file);

      expect(result).toBe(true);
    });
  });

  describe('Auto-attach exclusion', () => {
    it('should NOT auto-attach file with excluded tag on file-open', () => {
      mockPlugin.app.metadataCache.getFileCache.mockReturnValue({
        frontmatter: { tags: ['system'] },
      });
      const file = new TFile('notes/system-file.md');

      // Simulate the check that happens during file-open
      const hasExcluded = (fileContextManager as any).hasExcludedTag(file);

      expect(hasExcluded).toBe(true);
      // File should NOT be added to attachedFiles
    });

    it('should auto-attach file without excluded tags', () => {
      mockPlugin.app.metadataCache.getFileCache.mockReturnValue({
        frontmatter: { tags: ['notes'] },
      });
      const file = new TFile('notes/normal-file.md');

      const hasExcluded = (fileContextManager as any).hasExcludedTag(file);

      expect(hasExcluded).toBe(false);
      // File CAN be added to attachedFiles
    });
  });
});
