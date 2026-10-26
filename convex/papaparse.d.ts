declare module "papaparse" {
  type ParseResult<T> = { data: T[]; errors: Array<{ code: string }> };
  const Papa: {
    parse<T>(input: string, config: { header?: boolean; skipEmptyLines?: boolean | "greedy" }): ParseResult<T>;
  };
  export default Papa;
}
