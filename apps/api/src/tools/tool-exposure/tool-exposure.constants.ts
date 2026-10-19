/** 单条 tool_search 结果中 parameters JSON 字符上限；超出则不 activate。 */
export const TOOL_SEARCH_MAX_SCHEMA_CHARS = 12_288;

/** Run 内 activatedTools 写入上限（§10.3）；超出后不再升格进 tools[]。 */
export const MCP_ACTIVATED_CAP = 16;

export const DEFAULT_MCP_DIRECT_CAP = 32;
export const DEFAULT_TOOL_SEARCH_LIMIT = 8;

export const DEFERRED_TOOL_SEARCH_SYSTEM_HINT =
  'Some MCP tools are not listed directly in tools[]. Use tool_search with an English query to find deferred tools, then function_call the exact name from the result.';
