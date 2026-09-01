const THREE_MODULE_URL = new URL('../../assets/vendor/three-r185/three.module.min.js', import.meta.url).href;
const GLTF_LOADER_URL = new URL('../../assets/vendor/three-r185/addons/loaders/GLTFLoader.js', import.meta.url).href;
const MODEL_URL = new URL('../../assets/models/imu-neutral-head.glb', import.meta.url).href;
const IDENTITY_QUATERNION = Object.freeze({ w: 1, x: 0, y: 0, z: 0 });

export const IMU_3D_ERROR_CODES = Object.freeze({
  THREE_IMPORT_FAILED: 'THREE_IMPORT_FAILED', GLTFLOADER_IMPORT_FAILED: 'GLTFLOADER_IMPORT_FAILED',
  WEBGL_UNAVAILABLE: 'WEBGL_UNAVAILABLE', WEBGL_CONTEXT_FAILED: 'WEBGL_CONTEXT_FAILED',
  GLB_FETCH_FAILED: 'GLB_FETCH_FAILED', GLB_PARSE_FAILED: 'GLB_PARSE_FAILED',
  MODEL_INIT_FAILED: 'MODEL_INIT_FAILED', FIRST_RENDER_FAILED: 'FIRST_RENDER_FAILED',
  UNKNOWN_3D_ERROR: 'UNKNOWN_3D_ERROR',
});

function sanitizeErrorMessage(error) {
  return String(error?.message || error || '未提供錯誤內容')
    .replace(/https?:\/\/\S+/gi, '[public asset]')
    .replace(/[A-Za-z]:\\[^\s]+/g, '[local path]')
    .replace(/file:\/\/\S+/gi, '[local path]')
    .replace(/\s+/g, ' ').trim().slice(0, 180);
}

function initializationError(code, stage, error) {
  const result = new Error(sanitizeErrorMessage(error));
  result.name = 'Imu3dInitializationError'; result.code = code; result.stage = stage;
  return result;
}

function normalizeInitializationError(error) {
  return error?.name === 'Imu3dInitializationError' && error.code && error.stage
    ? error : initializationError(IMU_3D_ERROR_CODES.UNKNOWN_3D_ERROR, 'unknown', error);
}

async function loadThreeModules() {
  let THREE;
  try { THREE = await import(THREE_MODULE_URL); }
  catch (error) { throw initializationError(IMU_3D_ERROR_CODES.THREE_IMPORT_FAILED, 'three-module', error); }
  try {
    const loaderModule = await import(GLTF_LOADER_URL);
    return { THREE, GLTFLoader: loaderModule.GLTFLoader };
  } catch (error) {
    throw initializationError(IMU_3D_ERROR_CODES.GLTFLOADER_IMPORT_FAILED, 'gltf-loader-module', error);
  }
}

function isQuaternion(value) {
  return value && [value.w, value.x, value.y, value.z].every(Number.isFinite);
}

export function createImuHeadRenderer({
  moduleLoader = loadThreeModules,
  modelUrl = MODEL_URL,
  fetchImpl = (...args) => globalThis.fetch(...args),
  requestFrame = (callback) => globalThis.requestAnimationFrame(callback),
  cancelFrame = (id) => globalThis.cancelAnimationFrame(id),
  resizeObserverFactory = (callback) => new globalThis.ResizeObserver(callback),
  pixelRatio = () => Math.min(globalThis.devicePixelRatio || 1, 1.5),
  webgl2Available = () => typeof globalThis.document === 'undefined' || 'WebGL2RenderingContext' in globalThis,
  onError = () => {},
} = {}) {
  let status = 'uninitialized';
  let loadPromise = null;
  let modules = null;
  let scene = null;
  let camera = null;
  let renderer = null;
  let orientationRoot = null;
  let modelRoot = null;
  let host = null;
  let resizeObserver = null;
  let pendingFrame = null;
  let latestQuaternion = { ...IDENTITY_QUATERNION };
  let paused = false;
  let contextLost = false;
  let lastError = null;
  let renderCount = 0;
  let attachCount = 0;
  let modelLoadCount = 0;
  let contextCount = 0;
  let modelLoadMs = 0;
  let generation = 0;

  const reportError = (error) => {
    const classified = normalizeInitializationError(error);
    lastError = Object.freeze({ code: classified.code, stage: classified.stage, message: classified.message });
    status = 'error';
    onError(lastError);
    return false;
  };

  const cancelPendingFrame = () => {
    if (pendingFrame === null) return;
    cancelFrame(pendingFrame);
    pendingFrame = null;
  };

  const updateSize = () => {
    if (!renderer || !camera || !host) return { width: 0, height: 0, changed: false };
    const width = Math.round(host.clientWidth || 0);
    const height = Math.round(host.clientHeight || 0);
    if (width <= 0 || height <= 0) return { width, height, changed: false };
    const canvas = renderer.domElement;
    const expectedWidth = Math.round(width * renderer.getPixelRatio());
    const expectedHeight = Math.round(height * renderer.getPixelRatio());
    const changed = canvas.width !== expectedWidth || canvas.height !== expectedHeight;
    if (changed) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    return { width, height, changed };
  };

  const renderNow = ({ first = false } = {}) => {
    if (paused || !host || !renderer || !orientationRoot || contextLost) return false;
    const size = updateSize();
    if (size.width <= 0 || size.height <= 0) {
      return first ? reportError(initializationError(IMU_3D_ERROR_CODES.FIRST_RENDER_FAILED, 'first-render-size', 'LIVE stage canvas size is zero')) : false;
    }
    try {
      orientationRoot.quaternion.set(latestQuaternion.x, latestQuaternion.y, latestQuaternion.z, latestQuaternion.w).normalize();
      renderer.render(scene, camera);
      renderCount += 1;
      if (first) status = 'ready';
      return true;
    } catch (error) {
      return reportError(initializationError(IMU_3D_ERROR_CODES.FIRST_RENDER_FAILED, first ? 'first-render' : 'render', error));
    }
  };

  const renderLatest = () => {
    pendingFrame = null;
    if (status === 'ready') renderNow();
  };

  const scheduleRender = () => {
    if (pendingFrame !== null || paused || !host || status !== 'ready' || contextLost) return false;
    pendingFrame = requestFrame(renderLatest);
    return true;
  };

  const handleContextLost = (event) => {
    event?.preventDefault?.();
    contextLost = true;
    cancelPendingFrame();
    reportError(initializationError(IMU_3D_ERROR_CODES.WEBGL_CONTEXT_FAILED, 'webgl-context-lost', 'WebGL context lost'));
  };

  const handleContextRestored = () => {
    contextLost = false;
    if (renderer && modelRoot) status = 'ready';
    scheduleRender();
  };

  const loadModel = async (GLTFLoader) => {
    let response;
    try {
      response = await fetchImpl(modelUrl, { credentials: 'same-origin' });
      if (!response?.ok) throw new Error(`GLB HTTP ${response?.status || 'unknown'}`);
    } catch (error) {
      throw initializationError(IMU_3D_ERROR_CODES.GLB_FETCH_FAILED, 'glb-fetch', error);
    }
    let buffer;
    try { buffer = await response.arrayBuffer(); }
    catch (error) { throw initializationError(IMU_3D_ERROR_CODES.GLB_FETCH_FAILED, 'glb-read', error); }
    try { return await new GLTFLoader().parseAsync(buffer, new URL('.', modelUrl).href); }
    catch (error) { throw initializationError(IMU_3D_ERROR_CODES.GLB_PARSE_FAILED, 'glb-parse', error); }
  };

  const ensureLoaded = async () => {
    if (['model-ready', 'ready'].includes(status)) return true;
    if (loadPromise) return loadPromise;
    status = 'loading';
    lastError = null;
    const loadGeneration = generation;
    const startedAt = globalThis.performance?.now?.() ?? Date.now();
    loadPromise = (async () => {
      try {
        modules = await moduleLoader();
        const { THREE, GLTFLoader } = modules;
        if (!THREE || typeof GLTFLoader !== 'function') throw initializationError(IMU_3D_ERROR_CODES.GLTFLOADER_IMPORT_FAILED, 'module-exports', 'Three or GLTFLoader export is missing');
        if (!webgl2Available()) throw initializationError(IMU_3D_ERROR_CODES.WEBGL_UNAVAILABLE, 'webgl-capability', 'WebGL2 is unavailable');
        try {
          scene = new THREE.Scene();
          camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
          camera.position.set(0, 0.36, 5.25);
          camera.lookAt(0, 0.35, 0);
          renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
        } catch (error) {
          throw initializationError(IMU_3D_ERROR_CODES.WEBGL_CONTEXT_FAILED, 'webgl-renderer', error);
        }
        contextCount += 1;
        try {
          renderer.setPixelRatio(pixelRatio());
          renderer.setClearColor(0x000000, 0);
          if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
          renderer.domElement.className = 'imu-head-canvas';
          renderer.domElement.setAttribute('role', 'img');
          renderer.domElement.setAttribute('aria-label', '相對姿態 3D 頭部示意');
          renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
          renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);
        } catch (error) {
          throw initializationError(IMU_3D_ERROR_CODES.WEBGL_CONTEXT_FAILED, 'webgl-context-setup', error);
        }

        try {
          scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b2cd, 2.25));
          const keyLight = new THREE.DirectionalLight(0xffffff, 2.15);
          keyLight.position.set(-2.5, 3.2, 4.5);
          scene.add(keyLight);
          const fillLight = new THREE.DirectionalLight(0xbcb1ff, 0.8);
          fillLight.position.set(3, 0.8, 2.2);
          scene.add(fillLight);
          orientationRoot = new THREE.Group();
          modelRoot = new THREE.Group();
          orientationRoot.add(modelRoot);
          scene.add(orientationRoot);
        } catch (error) {
          throw initializationError(IMU_3D_ERROR_CODES.MODEL_INIT_FAILED, 'scene-init', error);
        }
        const loadingRenderer = renderer;
        const loadingModelRoot = modelRoot;

        modelLoadCount += 1;
        const gltf = await loadModel(GLTFLoader);
        if (loadGeneration !== generation) {
          gltf.scene.traverse((object) => {
            object.geometry?.dispose?.();
            if (Array.isArray(object.material)) object.material.forEach((material) => material?.dispose?.());
            else object.material?.dispose?.();
          });
          loadingRenderer.dispose?.();
          return false;
        }
        try {
          const matte = new THREE.MeshStandardMaterial({ color: 0xc8c9ce, roughness: 0.92, metalness: 0 });
          gltf.scene.traverse((object) => {
            if (!object.isMesh) return;
            if (Array.isArray(object.material)) object.material.forEach((material) => material?.dispose?.());
            else object.material?.dispose?.();
            object.material = matte;
            object.castShadow = false;
            object.receiveShadow = false;
          });
          loadingModelRoot.add(gltf.scene);
          loadingModelRoot.position.set(0, -0.12, 0);
        } catch (error) {
          throw initializationError(IMU_3D_ERROR_CODES.MODEL_INIT_FAILED, 'model-init', error);
        }
        status = 'model-ready';
        modelLoadMs = (globalThis.performance?.now?.() ?? Date.now()) - startedAt;
        return true;
      } catch (error) {
        loadPromise = null;
        return reportError(error);
      }
    })();
    return loadPromise;
  };

  const attach = async (container) => {
    if (!container || typeof container.append !== 'function') return false;
    if (host !== container) {
      resizeObserver?.disconnect?.();
      resizeObserver = null;
      renderer?.domElement?.remove?.();
      host = container;
      attachCount += 1;
    }
    const loaded = await ensureLoaded();
    if (!loaded || !renderer) return false;
    try {
      if (renderer.domElement.parentNode !== host) host.append(renderer.domElement);
      if (!resizeObserver) {
        resizeObserver = resizeObserverFactory(() => {
          const size = updateSize();
          if (size.changed) scheduleRender();
        });
        resizeObserver.observe(host);
      }
    } catch (error) {
      return reportError(initializationError(IMU_3D_ERROR_CODES.FIRST_RENDER_FAILED, 'canvas-attach', error));
    }
    paused = false;
    if (status === 'model-ready' && !renderNow({ first: true })) return false;
    scheduleRender();
    return status === 'ready';
  };

  const detach = () => {
    cancelPendingFrame();
    resizeObserver?.disconnect?.();
    resizeObserver = null;
    renderer?.domElement?.remove?.();
    host = null;
    return status === 'ready';
  };

  const pause = () => {
    paused = true;
    cancelPendingFrame();
  };

  const resume = () => {
    paused = false;
    scheduleRender();
  };

  const setOrientation = (quaternion) => {
    if (!isQuaternion(quaternion)) return false;
    latestQuaternion = { w: quaternion.w, x: quaternion.x, y: quaternion.y, z: quaternion.z };
    scheduleRender();
    return true;
  };

  const dispose = () => {
    generation += 1;
    detach();
    const geometries = new Set();
    const materials = new Set();
    modelRoot?.traverse?.((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
      else if (object.material) materials.add(object.material);
    });
    geometries.forEach((geometry) => geometry.dispose?.());
    materials.forEach((material) => material.dispose?.());
    renderer?.domElement?.removeEventListener?.('webglcontextlost', handleContextLost);
    renderer?.domElement?.removeEventListener?.('webglcontextrestored', handleContextRestored);
    renderer?.dispose?.();
    status = 'disposed';
    loadPromise = null;
    modules = null;
    scene = null;
    camera = null;
    renderer = null;
    orientationRoot = null;
    modelRoot = null;
    contextLost = false;
    paused = false;
  };

  return {
    ensureLoaded,
    attach,
    detach,
    pause,
    resume,
    setOrientation,
    dispose,
    getStatus: () => status,
    getError: () => lastError,
    getDiagnostics: () => ({ status, renderCount, attachCount, modelLoadCount, contextCount, pendingFrame: pendingFrame !== null, attached: Boolean(host), paused, contextLost, modelLoadMs, error: lastError }),
  };
}

export const imuHeadRenderer = createImuHeadRenderer();
