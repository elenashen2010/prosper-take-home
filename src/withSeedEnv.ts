/**
 * Loads a fresh copy of the app under other seed variables, for tests. Sets `env`, runs `load` inside
 * jest.isolateModules so the seed modules re-read it, restores every variable (deleting the ones that were
 * unset), and returns `load`'s value.
 */
export function withSeedEnv<T>(env: Readonly<Record<string, string>>, load: () => T): T {
  const previous = Object.fromEntries(Object.keys(env).map((name) => [name, process.env[name]]));
  Object.assign(process.env, env);
  try {
    const loaded: T[] = [];
    jest.isolateModules(() => {
      loaded.push(load());
    });
    return loaded[0];
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}
