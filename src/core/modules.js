export function moduleEnabled(engine, name) {
  const only = (engine.params.get('only') || '').split(',').filter(Boolean);
  const skip = (engine.params.get('skip') || '').split(',').filter(Boolean);
  const included = only.length === 0 || only.includes(name) || (only.includes('life') && ['character', 'wildlife'].includes(name));
  return included && !skip.includes(name) && !(skip.includes('life') && ['character', 'wildlife'].includes(name));
}

export function installModule(engine, name, factory, onError) {
  if (!moduleEnabled(engine, name)) return null;
  try {
    const module = factory();
    const object = module?.group || module?.mesh;
    if (object && object.parent !== engine.scene) engine.scene.add(object);
    if (module) engine.modules[name] = module;
    return module;
  } catch (error) {
    engine.errors.push(`${name}: ${error.message}`);
    console.error(`Longpan module ${name}`, error);
    onError?.(`${name}: ${error.stack || error.message}`);
    return null;
  }
}
