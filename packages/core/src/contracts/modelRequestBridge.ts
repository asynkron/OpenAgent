export async function requestModelCompletion(
  options: import('../agent/modelRequest.js').RequestModelCompletionOptions,
) {
  const mod = await import('../agent/modelRequest.js');
  return mod.requestModelCompletion(options);
}
