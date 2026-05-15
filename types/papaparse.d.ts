declare module 'papaparse' {
  interface ParseConfig {
    delimiter?: string;
    newline?: string;
    quoteChar?: string;
    escapeChar?: string;
    header?: boolean;
    dynamicTyping?: boolean;
    preview?: number;
    encoding?: string;
    worker?: boolean;
    comments?: boolean;
    complete?: (results: ParseResult) => void;
    error?: (error: Error) => void;
    chunk?: (results: ParseResult) => void;
    beforeFirstChunk?: (chunk: string) => string;
    transform?: (value: string, field: string | number) => string;
    transformHeader?: (header: string) => string;
    skipEmptyLines?: boolean | 'greedy';
    download?: boolean;
    downloadRequestHeaders?: Record<string, string>;
    downloadRequestBody?: unknown;
    stream?: boolean;
    fastMode?: boolean;
  }

  interface ParseResult {
    data: any[];
    errors: ParseError[];
    meta: ParseMeta;
  }

  interface ParseError {
    type: string;
    code: string;
    message: string;
    row: number;
  }

  interface ParseMeta {
    delimiter: string;
    linebreak: string;
    aborted: boolean;
    truncated: boolean;
    fields?: string[];
    cursor: number;
  }

  interface UnparseConfig {
    quotes?: boolean | boolean[] | ((value: any, field: string | number) => boolean);
    quoteChar?: string;
    escapeChar?: string;
    delimiter?: string;
    header?: boolean;
    newline?: string;
    skipEmptyLines?: boolean | 'greedy';
    columns?: string[] | Array<{ key: string; title?: string }>;
    escapeFormulae?: boolean | RegExp;
  }

  function parse<T = any>(input: string | File | Blob, config?: ParseConfig & { header: true }): ParseResult & { data: T[] };
  function parse(input: string | File | Blob, config?: ParseConfig): ParseResult;
  function unparse(data: any[] | { fields: string[]; data: any[] }, config?: UnparseConfig): string;

  const Papa: {
    parse: typeof parse;
    unparse: typeof unparse;
    RECORD_SEP: string;
    UNIT_SEP: string;
    BYTE_ORDER_MARK: string;
    BAD_DELIMITERS: string[];
    WORKERS_SUPPORTED: boolean;
    LocalChunkSize: number;
    DefaultDelimiter: string;
    Parser: any;
  };

  export default Papa;
}
