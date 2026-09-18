import { buildRefineSystemPrompt } from '@/core/prompt/instructionRefine';

describe('buildRefineSystemPrompt', () => {
  describe('without existing instructions', () => {

    it('should not include existing instructions section when empty', () => {
      const result = buildRefineSystemPrompt('');

      expect(result).not.toContain('EXISTING INSTRUCTIONS');
      expect(result).not.toContain('already in the user\'s system prompt');
    });

    it('should not include existing instructions section for whitespace-only input', () => {
      const result = buildRefineSystemPrompt('   \n\t  ');

      expect(result).not.toContain('EXISTING INSTRUCTIONS');
    });
  });

  describe('with existing instructions', () => {
    it('should include existing instructions section', () => {
      const existingInstructions = '- Use TypeScript for all code';

      const result = buildRefineSystemPrompt(existingInstructions);

      expect(result).toContain('EXISTING INSTRUCTIONS');
      expect(result).toContain('already in the user\'s system prompt');
      expect(result).toContain('- Use TypeScript for all code');
    });

    it('should wrap existing instructions in code block', () => {
      const existingInstructions = '- Rule 1\n- Rule 2';

      const result = buildRefineSystemPrompt(existingInstructions);

      expect(result).toContain('```\n- Rule 1\n- Rule 2\n```');
    });

    it('should treat existing instructions as read-only context for an appendable snippet', () => {
      const existingInstructions = '- Some rule';

      const result = buildRefineSystemPrompt(existingInstructions);

      expect(result).toContain('read-only reference');
      expect(result).toContain('appendable snippet');
      expect(result).toContain('Avoid duplicating existing instructions');
      expect(result).toContain('conflicts with an existing one');
      expect(result).toContain('Match the format of existing instructions');
      expect(result).toContain('Do not rewrite or restate the full existing prompt');
    });

    it('should trim whitespace from existing instructions', () => {
      const existingInstructions = '  \n  - Trimmed rule  \n  ';

      const result = buildRefineSystemPrompt(existingInstructions);

      expect(result).toContain('```\n- Trimmed rule\n```');
    });
  });

  describe('multiline existing instructions', () => {
    it('should handle multi-line existing instructions', () => {
      const existingInstructions = `## Code Style
- Use TypeScript
- Prefer functional patterns

## Documentation
- Add JSDoc comments
- Include examples`;

      const result = buildRefineSystemPrompt(existingInstructions);

      expect(result).toContain('## Code Style');
      expect(result).toContain('## Documentation');
      expect(result).toContain('- Use TypeScript');
      expect(result).toContain('- Add JSDoc comments');
    });

    it('should preserve formatting within existing instructions', () => {
      const existingInstructions = '- Item 1\n  - Nested item\n- Item 2';

      const result = buildRefineSystemPrompt(existingInstructions);

      expect(result).toContain('- Item 1\n  - Nested item\n- Item 2');
    });
  });
});
