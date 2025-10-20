declare module 'xlsx' {
  const xlsx: any;
  export default xlsx;
}

declare module 'expo-document-picker' {
  export const getDocumentAsync: (options?: any) => Promise<{ canceled?: boolean; assets?: Array<{ uri: string; name?: string; size?: number; mimeType?: string }> }>;
}
