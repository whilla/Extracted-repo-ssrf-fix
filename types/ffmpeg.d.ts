declare module '@ffmpeg/ffmpeg' {
  export class FFmpeg {
    constructor();
    load(): Promise<void>;
    writeFile(path: string, data: Uint8Array | string): Promise<void>;
    readFile(path: string): Promise<Uint8Array>;
    exec(args: string[]): Promise<void>;
    terminate(): void;
    on(event: string, callback: (...args: unknown[]) => void): void;
  }
}

declare module '@ffmpeg/util' {
  export function fetchFile(url: string): Promise<Uint8Array>;
  export function toBlob(data: Uint8Array, mimeType?: string): Blob;
}
