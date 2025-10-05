const defaultEnv = { ...process.env };

function loadModule() {
  jest.resetModules();
  process.env = { ...defaultEnv };
  jest.doMock('dotenv', () => ({ config: jest.fn() }));
  return require('../../index.js');
}

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...defaultEnv };
});

describe('inferLanguageFromDetectors', () => {
  test('detects git diff content', () => {
    const mod = loadModule();
    expect(mod.inferLanguageFromDetectors('diff --git a/file b/file')).toBe('diff');
  });

  test('detects language from command extensions', () => {
    const mod = loadModule();
    expect(mod.inferLanguageFromDetectors('cat scripts/example.py')).toBe('python');
    expect(mod.inferLanguageFromDetectors('read ./deploy.sh')).toBe('bash');
  });

  test('detects python heredoc blocks', () => {
    const mod = loadModule();
    const heredoc = ["python3 <<'PY'", "print('hi')", 'PY'].join('\\n');
    expect(mod.inferLanguageFromDetectors(heredoc)).toBe('python');
  });

  test('detects json structures', () => {
    const mod = loadModule();
    expect(mod.inferLanguageFromDetectors('{"foo": 1}')).toBe('json');
    expect(mod.inferLanguageFromDetectors('[1, 2, 3]')).toBe('json');
  });

  test('detects html snippets and shebangs', () => {
    const mod = loadModule();
    expect(mod.inferLanguageFromDetectors('<div>Hello</div>')).toBe('html');
    expect(mod.inferLanguageFromDetectors('#!/usr/bin/env python3')).toBe('python');
    expect(mod.inferLanguageFromDetectors('#!/bin/bash')).toBe('bash');
  });

  test('returns null when detectors do not match', () => {
    const mod = loadModule();
    expect(mod.inferLanguageFromDetectors('plain text without hints')).toBeNull();
  });
});

describe('detectLanguage', () => {
  test('prefers detected language over fallback', () => {
    const mod = loadModule();
    expect(mod.detectLanguage('diff --git a/file b/file', 'plaintext')).toBe('diff');
  });

  test('returns fallback when detectors fail', () => {
    const mod = loadModule();
    expect(mod.detectLanguage('plain text', 'plaintext')).toBe('plaintext');
    expect(mod.detectLanguage('', 'markdown')).toBe('markdown');
  });
});
