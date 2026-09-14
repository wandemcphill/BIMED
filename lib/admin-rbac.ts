export const ADMIN_PERMISSIONS = {
  CORE: 'admin.core',
  RECRUITMENT: 'recruitment.manage',
  WORKFORCE: 'workforce.manage',
  OPERATIONS: 'operations.manage',
  PAYROLL: 'payroll.manage',
  INTERNATIONAL: 'international.manage',
  COMMUNICATIONS: 'communications.manage',
  DOCUMENTS: 'documents.override',
} as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

const ALL_ADMIN_PERMISSIONS: readonly AdminPermission[] = [
  ADMIN_PERMISSIONS.CORE,
  ADMIN_PERMISSIONS.RECRUITMENT,
  ADMIN_PERMISSIONS.WORKFORCE,
  ADMIN_PERMISSIONS.OPERATIONS,
  ADMIN_PERMISSIONS.PAYROLL,
  ADMIN_PERMISSIONS.INTERNATIONAL,
  ADMIN_PERMISSIONS.COMMUNICATIONS,
  ADMIN_PERMISSIONS.DOCUMENTS,
];

const ROLE_PERMISSIONS: Record<string, readonly AdminPermission[]> = {
  admin: ALL_ADMIN_PERMISSIONS,
  super_admin: ALL_ADMIN_PERMISSIONS,
  hr: [
    ADMIN_PERMISSIONS.RECRUITMENT,
    ADMIN_PERMISSIONS.WORKFORCE,
    ADMIN_PERMISSIONS.OPERATIONS,
    ADMIN_PERMISSIONS.INTERNATIONAL,
    ADMIN_PERMISSIONS.COMMUNICATIONS,
    ADMIN_PERMISSIONS.DOCUMENTS,
  ],
  recruitment: [ADMIN_PERMISSIONS.RECRUITMENT, ADMIN_PERMISSIONS.COMMUNICATIONS],
  international_recruitment: [
    ADMIN_PERMISSIONS.RECRUITMENT,
    ADMIN_PERMISSIONS.INTERNATIONAL,
    ADMIN_PERMISSIONS.COMMUNICATIONS,
  ],
  operations: [ADMIN_PERMISSIONS.WORKFORCE, ADMIN_PERMISSIONS.OPERATIONS, ADMIN_PERMISSIONS.COMMUNICATIONS],
  manager: [ADMIN_PERMISSIONS.WORKFORCE, ADMIN_PERMISSIONS.OPERATIONS, ADMIN_PERMISSIONS.COMMUNICATIONS],
  finance: [ADMIN_PERMISSIONS.PAYROLL],
};

function normalizeRole(role: string) {
  return role.trim().toLowerCase().replace(/\s+/g, '_');
}

export function isKnownAdminRole(role: string) {
  return Boolean(ROLE_PERMISSIONS[normalizeRole(role)]);
}

export function hasAdminPermission(role: string, permission: AdminPermission) {
  const normalized = normalizeRole(role);
  return ROLE_PERMISSIONS[normalized]?.includes(permission) ?? false;
}

/**
 * Route-level policy for the server API surface.
 * Unknown admin API routes fail closed to admin.core rather than inheriting broad access.
 */
export function permissionForAdminPath(pathname: string): AdminPermission {
  const path = pathname.replace(/^\/api\/admin\/?/, '/');

  if (path === '/session' || path.startsWith('/password-reset')) return ADMIN_PERMISSIONS.CORE;
  if (path.startsWith('/applications')) return ADMIN_PERMISSIONS.RECRUITMENT;
  if (path.startsWith('/invites')) return ADMIN_PERMISSIONS.RECRUITMENT;
  if (path.startsWith('/messages')) return ADMIN_PERMISSIONS.COMMUNICATIONS;
  if (path.startsWith('/document-overrides')) return ADMIN_PERMISSIONS.DOCUMENTS;
  if (path.startsWith('/staff')) return ADMIN_PERMISSIONS.WORKFORCE;
  if (path.startsWith('/attendance')) return ADMIN_PERMISSIONS.OPERATIONS;
  if (path.startsWith('/rota')) return ADMIN_PERMISSIONS.OPERATIONS;
  if (path.startsWith('/payslips')) return ADMIN_PERMISSIONS.PAYROLL;
  if (path.startsWith('/permit')) return ADMIN_PERMISSIONS.INTERNATIONAL;

  return ADMIN_PERMISSIONS.CORE;
}
