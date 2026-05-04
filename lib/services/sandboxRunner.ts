// Sandbox Runner
// Executes AI-generated code in a separate worker thread with a restricted VM context.

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import vm from 'vm';
import { createManagerContext, type ManagerContext } from './managerContext';

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

  return new Promise((resolve) => {
    const worker = new Worker(`
      const { parentPort, workerData } = require('worker_threads');
      const vm = require('vm');

      async function execute() {
        try {
          const { code, input, context } = workerData;
          
          // Create a restricted sandbox context
          const sandbox = {
            ...context,
            console: {
              log: (...args) => parentPort.postMessage({ type: 'log', content: args.join(' ') }),
              error: (...args) => parentPort.postMessage({ type: 'error', content: args.join(' ') }),
            },
            // Prevent access to global Node.js objects
            process: undefined,
            require: undefined,
            module: undefined,
            __dirname: undefined,
            __filename: undefined,
          };

          vm.createContext(sandbox);
          
          // Wrap code in an async function to allow await
          const wrappedCode = \`async function __sandbox_main(input, context) { \${code} }\`;
          const script = new vm.Script(wrappedCode);
          const mainFn = script.runInContext(sandbox);

          const result = await mainFn(input, sandbox.context);
          parentPort.postMessage({ type: 'result', content: result });
        } catch (err) {
          parentPort.postMessage({ type: 'error', content: err.message });
        }
      }

      execute();
    `, {
      eval: true,
      workerData: {
        code,
        input,
        context: {
          kv: {
            get: (k) => parentPort.postMessage({ type: 'kv_get', key: k }),
            set: (k, v) => parentPort.postMessage({ type: 'kv_set', key: k, value: v }),
          },
        },
      },
    });

    const timeout = setTimeout(() => {
      worker.terminate();
      resolve({
        success: false,
        error: 'Execution timed out',
        duration: Date.now() - startTime,
      });
    }, timeoutMs);

    worker.on('message', async (msg) => {
      if (msg.type === 'result') {
        clearTimeout(timeout);
        worker.terminate();
        resolve({
          success: true,
          result: msg.content,
          duration: Date.now() - startTime,
        });
      } else if (msg.type === 'error') {
        clearTimeout(timeout);
        worker.terminate();
        resolve({
          success: false,
          error: msg.content,
          duration: Date.now() - startTime,
        });
      } else if (msg.type === 'log') {
        console.log("[Sandbox Log]: " + msg.content);
      } else if (msg.type === 'kv_get') {
        const val = await createManagerContext().kv.get(msg.key);
        worker.postMessage({ type: 'kv_get_res', value: val });
      } else if (msg.type === 'kv_set') {
        await createManagerContext().kv.set(msg.key, msg.value);
      }
    });

    worker.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        error: err.message,
        duration: Date.now() - startTime,
      });
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        resolve({
          success: false,
          error: "Worker exited with non-zero code",
          duration: Date.now() - startTime,
        });
      }
    });
  });
}
