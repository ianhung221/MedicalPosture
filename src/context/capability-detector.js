const UNKNOWN_PERMISSION = 'unknown';

function resolveEnvironment(overrides = {}) {
  const runtimeNavigator = typeof navigator === 'undefined' ? null : navigator;
  const runtimeDocument = typeof document === 'undefined' ? null : document;
  return {
    isSecureContext: overrides.isSecureContext ?? (typeof globalThis.isSecureContext === 'boolean' ? globalThis.isSecureContext : false),
    visibilityState: overrides.visibilityState ?? runtimeDocument?.visibilityState ?? 'visible',
    mediaDevices: overrides.mediaDevices ?? runtimeNavigator?.mediaDevices ?? null,
    permissions: overrides.permissions ?? runtimeNavigator?.permissions ?? null,
    DeviceMotionEvent: overrides.DeviceMotionEvent ?? globalThis.DeviceMotionEvent ?? null,
  };
}

async function queryPermission(permissions, name) {
  if (!permissions?.query) return UNKNOWN_PERMISSION;
  try {
    const result = await permissions.query({ name });
    return ['granted', 'prompt', 'denied'].includes(result?.state) ? result.state : UNKNOWN_PERMISSION;
  } catch {
    return UNKNOWN_PERMISSION;
  }
}

function unavailableCapability() {
  return { status: 'unavailable', permission: 'unsupported', apiSupported: false, devicePresent: null };
}

export async function probeCapabilities(overrides = {}) {
  const environment = resolveEnvironment(overrides);
  const { mediaDevices, DeviceMotionEvent } = environment;

  if (!environment.isSecureContext) {
    return {
      secureContext: false,
      visibility: environment.visibilityState === 'hidden' ? 'hidden' : 'visible',
      camera: unavailableCapability(),
      motion: { ...unavailableCapability(), receivingData: null, sampleAgeMs: null },
    };
  }

  let camera = unavailableCapability();
  if (mediaDevices?.enumerateDevices && mediaDevices?.getUserMedia) {
    const permission = await queryPermission(environment.permissions, 'camera');
    let devicePresent = null;
    if (environment.visibilityState !== 'hidden') {
      try {
        const devices = await mediaDevices.enumerateDevices();
        devicePresent = devices.some((device) => device.kind === 'videoinput');
      } catch {
        devicePresent = null;
      }
    }

    let status = 'unknown';
    if (permission === 'denied') status = 'denied';
    else if (permission === 'granted' && devicePresent) status = 'available';
    else if (permission === 'granted' && devicePresent === null) status = 'unknown';
    else if (permission === 'granted') status = 'unavailable';
    else if (permission === 'prompt' || devicePresent) status = 'permission-required';

    camera = { status, permission, apiSupported: true, devicePresent };
  }

  let motion = { ...unavailableCapability(), receivingData: null, sampleAgeMs: null };
  if (DeviceMotionEvent && (typeof DeviceMotionEvent === 'function' || typeof DeviceMotionEvent === 'object')) {
    const permissionRequired = typeof DeviceMotionEvent?.requestPermission === 'function';
    motion = {
      status: permissionRequired ? 'permission-required' : 'unknown',
      permission: permissionRequired ? 'prompt' : UNKNOWN_PERMISSION,
      apiSupported: true,
      devicePresent: null,
      receivingData: null,
      sampleAgeMs: null,
    };
  }

  return {
    secureContext: true,
    visibility: environment.visibilityState === 'hidden' ? 'hidden' : 'visible',
    camera,
    motion,
  };
}

export async function requestCameraCapability(overrides = {}) {
  const environment = resolveEnvironment(overrides);
  if (!environment.isSecureContext || !environment.mediaDevices?.getUserMedia) return unavailableCapability();

  let stream = null;
  try {
    stream = await environment.mediaDevices.getUserMedia({ video: true, audio: false });
    return { status: 'available', permission: 'granted', apiSupported: true, devicePresent: true };
  } catch (error) {
    if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
      return { status: 'denied', permission: 'denied', apiSupported: true, devicePresent: null };
    }
    if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
      return { status: 'unavailable', permission: 'granted', apiSupported: true, devicePresent: false };
    }
    return { status: 'unknown', permission: UNKNOWN_PERMISSION, apiSupported: true, devicePresent: null };
  } finally {
    stream?.getTracks?.().forEach((track) => track.stop());
  }
}

export { resolveEnvironment };
