import { jest } from '@jest/globals';

const defaultEnv = { ...process.env };

async function loadModule() {
  jest.resetModules();
  process.env = { ...defaultEnv };
  jest.unstable_mockModule('dotenv/config', () => ({}));
  const imported = await import('../../index.js');
  return imported.default;
}

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...defaultEnv };
});

describe('inferLanguageFromDetectors', () => {
  test('detects git diff content', async () => {
    const mod = await loadModule();
    expect(mod.inferLanguageFromDetectors('diff --git a/file b/file')).toBe('diff');
  });

  test('detects language from command extensions', async () => {
    const mod = await loadModule();
    expect(mod.inferLanguageFromDetectors('cat scripts/example.py')).toBe('python');
    expect(mod.inferLanguageFromDetectors('read ./deploy.sh')).toBe('bash');
  });

  test('detects python heredoc blocks', async () => {
    const mod = await loadModule();
    const heredoc = ["python3 <<'PY'", "print('hi')", 'PY'].join('\n');
    expect(mod.inferLanguageFromDetectors(heredoc)).toBe('python');
  });

  test('detects json structures', async () => {
    const mod = await loadModule();
    expect(mod.inferLanguageFromDetectors('{"foo": 1}')).toBe('json');
    expect(mod.inferLanguageFromDetectors('[1, 2, 3]')).toBe('json');
  });

  test('detects html snippets and shebangs', async () => {
    const mod = await loadModule();
    expect(mod.inferLanguageFromDetectors('<div>Hello</div>')).toBe('html');
    expect(mod.inferLanguageFromDetectors('#!/usr/bin/env python3')).toBe('python');
    expect(mod.inferLanguageFromDetectors('#!/bin/bash')).toBe('bash');
  });

  test('returns null when detectors do not match', async () => {
    const mod = await loadModule();
    expect(mod.inferLanguageFromDetectors('plain text without hints')).toBeNull();
  });
});

describe('detectLanguage', () => {
  test('prefers detected language over fallback', async () => {
    const mod = await loadModule();
    expect(mod.detectLanguage('diff --git a/file b/file', 'plaintext')).toBe('diff');
  });

  test('returns fallback when detectors fail', async () => {
    const mod = await loadModule();
    expect(mod.detectLanguage('plain text', 'plaintext')).toBe('plaintext');
    expect(mod.detectLanguage('', 'markdown')).toBe('markdown');
  });
});
