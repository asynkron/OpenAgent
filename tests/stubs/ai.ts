// Minimal Jest-facing shim for the Vercel AI SDK.
// Tests immediately mock these exports via `jest.unstable_mockModule`,
// but Jest still requires the module to exist on disk for resolution.
export async function generateText() {
  throw new Error('generateText stub invoked without a test mock.');
}

export async function generateObject() {
  throw new Error('generateObject stub invoked without a test mock.');
}

// The runtime streams structured tool responses with `streamObject`; expose a
// matching placeholder so Jest can mock it during tests without hitting the
// real SDK surface.
export function streamObject() {
  throw new Error('streamObject stub invoked without a test mock.');
}
