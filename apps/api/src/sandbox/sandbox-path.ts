import { SANDBOX_WORKSPACE_ROOT } from './sandbox-config';

export function resolveWorkspacePath(relative = '.'): string {
  if (!relative || relative.includes('\0')) {
    throw new Error('invalid workspace path');
  }
  if (relative.startsWith('/')) {
    throw new Error('absolute paths are not allowed');
  }
  const parts: string[] = [];
  for (const part of relative.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') throw new Error('path escapes workspace');
    parts.push(part);
  }
  return parts.length === 0 ? SANDBOX_WORKSPACE_ROOT : `${SANDBOX_WORKSPACE_ROOT}/${parts.join('/')}`;
}

export function assertWorkspaceFilePath(relative: string): string {
  const resolved = resolveWorkspacePath(relative);
  if (resolved === SANDBOX_WORKSPACE_ROOT) {
    throw new Error('path must be a workspace-relative file');
  }
  return resolved;
}
