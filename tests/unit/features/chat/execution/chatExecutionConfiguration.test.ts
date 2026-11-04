import { resolveChatSystemInstructions } from '@/features/chat/execution/chatExecutionConfiguration';

describe('resolveChatSystemInstructions', () => {
  const settings = {
    mediaFolder: 'attachments',
    systemPrompt: 'Prefer short answers.',
    userName: 'Alice',
  };

  it('passes the personal pack identity into the system prompt', () => {
    const { instructions } = resolveChatSystemInstructions(
      settings,
      '/vault',
      undefined,
      'You are Miss. Coco, the attendant for this flight.',
    );

    expect(instructions).toContain('## Personal Instructions');
    expect(instructions).toContain('You are Miss. Coco, the attendant for this flight.');
    expect(instructions.indexOf('## Custom Instructions')).toBeLessThan(
      instructions.indexOf('## Personal Instructions'),
    );
  });

  it('omits the personal section when the pack is not installed', () => {
    const withoutPack = resolveChatSystemInstructions(settings, '/vault', undefined, '');
    const withWhitespace = resolveChatSystemInstructions(settings, '/vault', undefined, '  ');

    expect(withoutPack.instructions).not.toContain('## Personal Instructions');
    expect(withWhitespace.instructions).toBe(withoutPack.instructions);
  });

  it('keeps project instructions after the personal section', () => {
    const sessionInstructions = '## Project\n\nBody';
    const { instructions } = resolveChatSystemInstructions(
      settings,
      '/vault',
      sessionInstructions,
      'Identity text.',
    );

    expect(instructions.endsWith(`\n\n${sessionInstructions}`)).toBe(true);
    expect(instructions.indexOf('## Personal Instructions')).toBeLessThan(
      instructions.indexOf('## Project'),
    );
  });
});
