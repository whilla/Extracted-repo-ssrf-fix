// Sandbox Runner - Serverless Optimized
// Executes AI-generated code using the vm module.
// WARNING: Node.js vm module is NOT a security boundary.
// This sandbox provides basic isolation only. For untrusted code,
// use a proper isolation solution (containers, Web Workers, isolated-vm).

import vm from 'vm';
import { createManagerContext } from './managerContext';

export interface SandboxResult<T = any> {
  success: boolean;
  result?: T;
  error?: string;
  duration: number;
}

function hardenSandboxContext(context: vm.Context) {
  Object.freeze(context);
  Object.freeze(context.console);

  const blockedGlobals = [
    'process', 'require', 'module', 'exports', '__dirname', '__filename',
    'global', 'globalThis', 'Buffer', 'setImmediate', 'clearImmediate',
  ];
  for (const name of blockedGlobals) {
    try {
      Object.defineProperty(context, name, {
        value: undefined,
        writable: false,
        configurable: false,
        enumerable: false,
      });
    } catch {
      // Property may already be frozen
    }
  }
}

export async function runSandboxedCode<T = any>(
  code: string,
  input: any,
  timeoutMs: number = 500
): Promise<SandboxResult<T>> {
  const startTime = Date.now();
  const context = createManagerContext();

  try {
    const sandbox: vm.Context = {
      ...context,
      console: {
        log: (...args: any[]) => console.log("[Sandbox Log]:", ...args),
        error: (...args: any[]) => console.error("[Sandbox Error]:", ...args),
      },
    };

    hardenSandboxContext(sandbox);
    vm.createContext(sandbox);

    const wrappedCode = `(function __sandbox_main(input, context) { "use strict"; ${code} })`;
    const script = new vm.Script(wrappedCode, {
      filename: 'sandbox.js',
    });

    const mainFn = script.runInContext(sandbox, { timeout: timeoutMs });

    if (typeof mainFn !== 'function') {
      return {
        success: false,
        error: 'Sandbox code did not produce a callable function',
        duration: Date.now() - startTime,
      };
    }

    const result = await mainFn(input, context);

    return {
      success: true,
      result,
      duration: Date.now() - startTime,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unknown execution error',
      duration: Date.now() - startTime,
    };
  }
}
