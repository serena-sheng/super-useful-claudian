import { Modal, setIcon } from 'obsidian';

export type ApprovalDecision = 'allow' | 'allow-always' | 'deny';

/**
 * Modal for approving tool actions
 */
export class ApprovalModal extends Modal {
  private toolName: string;
  private input: Record<string, unknown>;
  private description: string;
  private resolve: (value: ApprovalDecision) => void;
  private resolved = false;

  constructor(
    app: import('obsidian').App,
    toolName: string,
    input: Record<string, unknown>,
    description: string,
    resolve: (value: ApprovalDecision) => void
  ) {
    super(app);
    this.toolName = toolName;
    this.input = input;
    this.description = description;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('claudian-approval-modal');
    this.setTitle('Permission required');

    // Tool info
    const infoEl = contentEl.createDiv({ cls: 'claudian-approval-info' });

    const toolEl = infoEl.createDiv({ cls: 'claudian-approval-tool' });
    const iconEl = toolEl.createSpan({ cls: 'claudian-approval-icon' });
    setIcon(iconEl, this.getToolIcon(this.toolName));
    toolEl.createSpan({ text: this.toolName, cls: 'claudian-approval-tool-name' });

    // Description
    const descEl = contentEl.createDiv({ cls: 'claudian-approval-desc' });
    descEl.setText(this.description);

    // Details (collapsible)
    const detailsEl = contentEl.createEl('details', { cls: 'claudian-approval-details' });
    detailsEl.createEl('summary', { text: 'Show details' });
    const codeEl = detailsEl.createEl('pre', { cls: 'claudian-approval-code' });
    codeEl.setText(JSON.stringify(this.input, null, 2));

    // Buttons
    const buttonsEl = contentEl.createDiv({ cls: 'claudian-approval-buttons' });

    const denyBtn = buttonsEl.createEl('button', { text: 'Deny', cls: 'claudian-approval-btn claudian-deny-btn' });
    denyBtn.addEventListener('click', () => this.handleDecision('deny'));

    const allowBtn = buttonsEl.createEl('button', { text: 'Allow Once', cls: 'claudian-approval-btn claudian-allow-btn' });
    allowBtn.addEventListener('click', () => this.handleDecision('allow'));

    const alwaysBtn = buttonsEl.createEl('button', { text: 'Always Allow', cls: 'claudian-approval-btn claudian-always-btn' });
    alwaysBtn.addEventListener('click', () => this.handleDecision('allow-always'));
  }

  private getToolIcon(toolName: string): string {
    const iconMap: Record<string, string> = {
      'Read': 'file-text',
      'Write': 'edit-3',
      'Edit': 'edit',
      'Bash': 'terminal',
      'Glob': 'folder-search',
      'Grep': 'search',
      'LS': 'list',
    };
    return iconMap[toolName] || 'wrench';
  }

  private handleDecision(decision: ApprovalDecision) {
    if (!this.resolved) {
      this.resolved = true;
      this.resolve(decision);
      this.close();
    }
  }

  onClose() {
    // If closed without decision, treat as deny
    if (!this.resolved) {
      this.resolved = true;
      this.resolve('deny');
    }
    this.contentEl.empty();
  }
}
