const MODEL_URL = new URL('../../assets/models/imu-neutral-head.glb', import.meta.url).href;
const IDENTITY_QUATERNION = Object.freeze({ w: 1, x: 0, y: 0, z: 0 });

async function loadThreeModules() {
  const [THREE, loaderModule] = await Promise.all([
    import('three'),
    import('three/addons/loaders/GLTFLoader.js'),
  ]);
  return { THREE, GLTFLoader: loaderModule.GLTFLoader };
}

function isQuaternion(value) {
  return value && [value.w, value.x, value.y, value.z].every(Number.isFinite);
}

export function createImuHeadRenderer({
  moduleLoader = loadThreeModules,
  modelUrl = MODEL_URL,
  requestFrame = (callback) => globalThis.requestAnimationFrame(callback),
  cancelFrame = (id) => globalThis.cancelAnimationFrame(id),
  resizeObserverFactory = (callback) => new globalThis.ResizeObserver(callback),
  pixelRatio = () => Math.min(globalThis.devicePixelRatio || 1, 1.5),
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
  let renderCount = 0;
  let attachCount = 0;
  let modelLoadCount = 0;
  let contextCount = 0;
  let modelLoadMs = 0;
  let generation = 0;

  const cancelPendingFrame = () => {
    if (pendingFrame === null) return;
    cancelFrame(pendingFrame);
    pendingFrame = null;
  };

  const updateSize = () => {
    if (!renderer || !camera || !host) return false;
    const width = Math.max(1, Math.round(host.clientWidth || 1));
    const height = Math.max(1, Math.round(host.clientHeight || 1));
    const canvas = renderer.domElement;
    const expectedWidth = Math.round(width * renderer.getPixelRatio());
    const expectedHeight = Math.round(height * renderer.getPixelRatio());
    if (canvas.width === expectedWidth && canvas.height === expectedHeight) return false;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    return true;
  };

  const renderLatest = () => {
    pendingFrame = null;
    if (paused || !host || status !== 'ready' || contextLost || !renderer || !orientationRoot) return;
    updateSize();
    orientationRoot.quaternion.set(latestQuaternion.x, latestQuaternion.y, latestQuaternion.z, latestQuaternion.w).normalize();
    renderer.render(scene, camera);
    renderCount += 1;
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
    onError(new Error('3D 姿態示意的 WebGL context 已中斷。'));
  };

  const handleContextRestored = () => {
    contextLost = false;
    scheduleRender();
  };

  const ensureLoaded = async () => {
    if (status === 'ready') return true;
    if (loadPromise) return loadPromise;
    status = 'loading';
    const loadGeneration = generation;
    const startedAt = globalThis.performance?.now?.() ?? Date.now();
    loadPromise = (async () => {
      try {
        modules = await moduleLoader();
        const { THREE, GLTFLoader } = modules;
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
        camera.position.set(0, 0.36, 5.25);
        camera.lookAt(0, 0.35, 0);
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
        contextCount += 1;
        renderer.setPixelRatio(pixelRatio());
        renderer.setClearColor(0x000000, 0);
        if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.className = 'imu-head-canvas';
        renderer.domElement.setAttribute('role', 'img');
        renderer.domElement.setAttribute('aria-label', '相對姿態 3D 頭部示意');
        renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
        renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

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
        const loadingRenderer = renderer;
        const loadingModelRoot = modelRoot;

        modelLoadCount += 1;
        const gltf = await new GLTFLoader().loadAsync(modelUrl);
        if (loadGeneration !== generation) {
          gltf.scene.traverse((object) => {
            object.geometry?.dispose?.();
            if (Array.isArray(object.material)) object.material.forEach((material) => material?.dispose?.());
            else object.material?.dispose?.();
          });
          loadingRenderer.dispose?.();
          return false;
        }
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
        status = 'ready';
        modelLoadMs = (globalThis.performance?.now?.() ?? Date.now()) - startedAt;
        if (host && renderer.domElement.parentNode !== host) host.append(renderer.domElement);
        scheduleRender();
        return true;
      } catch (error) {
        status = 'error';
        loadPromise = null;
        onError(error);
        return false;
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
    if (renderer.domElement.parentNode !== host) host.append(renderer.domElement);
    if (!resizeObserver) {
      resizeObserver = resizeObserverFactory(() => {
        if (updateSize()) scheduleRender();
      });
      resizeObserver.observe(host);
    }
    paused = false;
    updateSize();
    scheduleRender();
    return true;
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
    getDiagnostics: () => ({ status, renderCount, attachCount, modelLoadCount, contextCount, pendingFrame: pendingFrame !== null, attached: Boolean(host), paused, contextLost, modelLoadMs }),
  };
}

export const imuHeadRenderer = createImuHeadRenderer();
