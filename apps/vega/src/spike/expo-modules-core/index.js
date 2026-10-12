// SPIKE (src/spike/GlSpike.js): the only expo-modules-core names @amazon-devices/expo-gl's Vega build uses. It imports
// the package without declaring it, and there is no Vega port of it; metro.config.js maps the package name here.
export class CodedError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export class UnavailabilityError extends CodedError {
  constructor(moduleName, propertyName) {
    super('ERR_UNAVAILABLE', `The method or property ${moduleName}.${propertyName} is not available on this platform.`);
  }
}

export const Platform = { OS: 'kepler' };
