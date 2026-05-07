// Sandbox Runner - Serverless Optimized
// Executes AI-generated code using the vm module.
// Note: worker_threads are removed for Lambda compatibility.

import vm from 'vm';
import { createManagerContext } from './managerContext';

export interface SandboxResult<T = any> {
  success: boolean;
  result?: T;
  error?: string;
  duration: number;
}

export async function runSandboxedCode<T = any>(
  code: string,
  input: any,
  timeoutMs: number = 500
): Promise<SandboxResult<T>> {
  const startTime = Date.now();
  const context = createManagerContext();

  try {
    // Create a restricted sandbox context
    const sandbox = {
      ...context,
      console: {
        log: (...args: any[]) => console.log("[Sandbox Log]:", ...args),
        error: (...args: any[]) => console.error("[Sandbox Error]:", ...args),
      },
      process: undefined,
      require: undefined,
      module: undefined,
      __dirname: undefined,
      __filename: undefined,
    };

    vm.createContext(sandbox);
    
    // Wrap code in an async function to allow await
    const wrappedCode = `async function __sandbox_main(input, context) { ${code} }`;
    const script = new vm.Script(wrappedCode);
    const mainFn = script.runInContext(sandbox);

    // Execute with a timeout
    const result = await Promise.race([
      (async () => {
        // Use vm's native timeout to stop infinite loops on the main thread
        const execution = script.runInContext(sandbox, { timeout: timeoutMs });
        return await execution(input, sandbox.context);
      })(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Execution timed out')), timeoutMs)
      )
    ]);

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
