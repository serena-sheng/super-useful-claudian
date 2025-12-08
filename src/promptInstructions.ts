/**
 * Dynamic prompt instruction generators
 * These functions generate context-specific instructions for the system prompt
 */

/**
 * Generate instruction for embedded images in notes
 * Tells the agent where to find images referenced with ![[image.jpg]] syntax
 */
export function getMediaFolderInstruction(mediaFolder: string): string {
  const folder = mediaFolder.trim();
  const mediaPath = folder ? `./${folder}` : '.';
  const examplePath = folder ? `${folder}/` : '';

  return `

# Embedded Images in Notes

When you see embedded images in Obsidian markdown notes using the syntax \`![[image.jpg]]\` or \`![[image.png]]\`:
- The actual image file is located in the media folder: \`${mediaPath}\`
- To view/analyze the image, use Read with the full path: \`${mediaPath}/image.jpg\`
- Example: If a note contains \`![[screenshot.png]]\`, read it with: Read file_path="${examplePath}screenshot.png"
- Supported formats: PNG, JPG/JPEG, GIF, WebP`;
}
