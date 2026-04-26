declare module 'pg-query-emscripten' {
  export default class PgQueryModule {
    constructor();
    parse(sql: string): unknown;
  }
}
