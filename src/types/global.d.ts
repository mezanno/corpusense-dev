// global.d.ts
// Use this file to extend the global scope if needed.
// Avoid redefining globalThis as it can conflict with built-in types.

export {};

interface FileSystemHandle {
  queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;

  requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}
