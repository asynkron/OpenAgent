import { parseReadSpecTokens, mergeReadSpecs } from '../../src/commands/readSpec.js';

describe('readSpec utilities', () => {
  describe('parseReadSpecTokens', () => {
    test('parses positional path and options', () => {
      const tokens = [
        '../logs/app.log',
        '--max-lines',
        '20',
        '--max-bytes=512',
        '--encoding',
        'utf8',
      ];
      const spec = parseReadSpecTokens(tokens);

      expect(spec).toEqual({
        path: '../logs/app.log',
        max_lines: 20,
        max_bytes: 512,
        encoding: 'utf8',
      });
    });

    test('collects multiple positional paths', () => {
      const tokens = ['first.txt', 'second.txt', '--max-lines', '5'];
      const spec = parseReadSpecTokens(tokens);

      expect(spec).toEqual({
        path: 'first.txt',
        paths: ['second.txt'],
        max_lines: 5,
      });
    });

    test('handles non-array input gracefully', () => {
      expect(parseReadSpecTokens(null)).toEqual({});
      expect(parseReadSpecTokens(undefined)).toEqual({});
    });
  });

  describe('mergeReadSpecs', () => {
    test('preserves order and uniqueness of paths', () => {
      const base = { path: './README.md', paths: ['CHANGELOG.md'] };
      const override = { path: './README.md', paths: ['docs/guide.md'] };

      expect(mergeReadSpecs(base, override)).toEqual({
        path: './README.md',
        paths: ['CHANGELOG.md', 'docs/guide.md'],
      });
    });

    test('applies override metadata when base omits it', () => {
      const base = { path: 'file.txt' };
      const override = { max_lines: 10, max_bytes: 256, encoding: 'utf8' };

      expect(mergeReadSpecs(base, override)).toEqual({
        path: 'file.txt',
        max_lines: 10,
        max_bytes: 256,
        encoding: 'utf8',
      });
    });

    test('removes paths when both specs lack them', () => {
      const base = { max_lines: 3 };
      const override = { max_bytes: 100 };

      expect(mergeReadSpecs(base, override)).toEqual({
        max_lines: 3,
        max_bytes: 100,
      });
    });
  });
});
