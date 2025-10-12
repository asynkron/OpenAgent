module.exports = (request, options) => {
  try {
    return options.defaultResolver(request, options);
  } catch (error) {
    if (request.endsWith('.js')) {
      const tsRequest = request.replace(/\.js$/, '.ts');
      try {
        return options.defaultResolver(tsRequest, options);
      } catch (tsError) {
        // ignore and fall through to original error
      }
    }
    throw error;
  }
};
