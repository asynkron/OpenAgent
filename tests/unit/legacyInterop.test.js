/**
 * These tests ensure the legacy directory now simply re-exports the modern ESM modules.
 * That way existing import paths continue to work even though the implementation moved.
 */
describe('Legacy compatibility wrappers', () => {
  test('legacy index mirrors the primary module exports', async () => {
    const [legacyModule, modernModule] = await Promise.all([
      import('../../legacy/index.js'),
      import('../../index.js'),
    ]);

    expect(legacyModule.agentLoop).toBe(modernModule.agentLoop);
    expect(legacyModule.runCommandAndTrack).toBe(modernModule.runCommandAndTrack);
    expect(legacyModule.default.STARTUP_FORCE_AUTO_APPROVE).toBe(
      modernModule.default.STARTUP_FORCE_AUTO_APPROVE,
    );
    expect(legacyModule.default).toBe(modernModule.default);
  });

  test('individual legacy modules forward to the modern implementations', async () => {
    const [legacyEdit, modernEdit] = await Promise.all([
      import('../../legacy/src/commands/edit.js'),
      import('../../src/commands/edit.js'),
    ]);

    expect(legacyEdit.applyFileEdits).toBe(modernEdit.applyFileEdits);
  });
});
