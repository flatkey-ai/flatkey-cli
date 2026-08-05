export const CLI_REQUEST_HEADERS = {
  "x-flatkey-client": "cli",
};

export function withCliRequestHeaders(headers = {}) {
  return {
    ...headers,
    ...CLI_REQUEST_HEADERS,
  };
}
