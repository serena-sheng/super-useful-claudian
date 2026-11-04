import {
  PERSONAL_PACK_IDENTITY_PATH,
  PERSONAL_PACK_ROOT,
  PersonalPackService,
} from '@/app/personal-pack/PersonalPackService';

function createReader(files: Record<string, string>): {
  reader: { exists(path: string): Promise<boolean>; read(path: string): Promise<string> };
  files: Record<string, string>;
} {
  return {
    files,
    reader: {
      exists: async path => path in files,
      read: async path => {
        if (!(path in files)) throw new Error(`missing: ${path}`);
        return files[path];
      },
    },
  };
}

describe('PersonalPackService', () => {
  it('loads the pack identity, trimmed, from the documented vault path', async () => {
    const { reader } = createReader({
      [PERSONAL_PACK_IDENTITY_PATH]: '  You are Miss. Coco.  \n\nKeep replies short.\n',
    });
    const pack = new PersonalPackService(reader);

    await pack.load();

    expect(pack.getIdentityInstructions()).toBe('You are Miss. Coco.  \n\nKeep replies short.');
    expect(pack.identityPath).toBe('.super-useful-claudian/personal/identity.md');
    expect(PERSONAL_PACK_ROOT).toBe('.super-useful-claudian/personal');
  });

  it('reports an empty identity when no pack is installed', async () => {
    const { reader } = createReader({});
    const pack = new PersonalPackService(reader);

    await pack.load();

    expect(pack.getIdentityInstructions()).toBe('');
  });

  it('treats an unreadable pack as not installed', async () => {
    const pack = new PersonalPackService({
      exists: async () => true,
      read: async () => { throw new Error('EACCES'); },
    });

    await pack.load();

    expect(pack.getIdentityInstructions()).toBe('');
  });

  it('reflects the latest file on reload and clears it when the file is removed', async () => {
    const { reader, files } = createReader({ [PERSONAL_PACK_IDENTITY_PATH]: 'first' });
    const pack = new PersonalPackService(reader);
    await pack.load();
    expect(pack.getIdentityInstructions()).toBe('first');

    files[PERSONAL_PACK_IDENTITY_PATH] = 'second';
    await pack.load();
    expect(pack.getIdentityInstructions()).toBe('second');

    delete files[PERSONAL_PACK_IDENTITY_PATH];
    await pack.load();
    expect(pack.getIdentityInstructions()).toBe('');
  });

  it('recognizes only the identity file as a prompt-affecting path', () => {
    const { reader } = createReader({});
    const pack = new PersonalPackService(reader);

    expect(pack.isIdentityPath(PERSONAL_PACK_IDENTITY_PATH)).toBe(true);
    expect(pack.isIdentityPath(`${PERSONAL_PACK_ROOT}/commands/today.md`)).toBe(false);
  });
});
