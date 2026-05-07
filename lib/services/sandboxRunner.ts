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
  const managerContext = createManagerContext();

  try {
    // Create a restricted sandbox context
    const sandbox = {
      ...managerContext,
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

    const vmContext = vm.createContext(sandbox);
    
    // Wrap code in an async function to allow await
    const wrappedCode = `async function __sandbox_main(input, context) { ${code} }`;
    const script = new vm.Script(wrappedCode);
    
    // Execute with a timeout
    const result = await Promise.race([
      (async () => {
        try {
          const resultValue = script.runInContext(vmContext, { timeout: timeoutMs });
          if (typeof resultValue === 'function') {
            return await resultValue(input, vmContext);
          }
          return resultValue;
        } catch (vmError: any) {
          throw new Error(`VM Execution Error: ${vmError.message}`);
        }
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
