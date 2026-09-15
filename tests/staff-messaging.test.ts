import { describe, expect, it } from 'vitest';
import { directKey, normalizePortalAddress, namespaceForRole } from '@/lib/staff-messaging';
import { hasAdminPermission, permissionForAdminPath } from '@/lib/admin-rbac';

describe('staff messaging helpers', () => {
  it('normalizes internal portal addresses', () => {
    expect(normalizePortalAddress('  Jane.Doe @ BIMEDCARE ')).toBe('jane.doe@bimedcare');
  });

  it('maps care and physiotherapy roles to the correct namespaces', () => {
    expect(namespaceForRole('Healthcare Assistant')).toBe('bimedcare');
    expect(namespaceForRole('Support Worker')).toBe('bimedcare');
    expect(namespaceForRole('Physiotherapist')).toBe('bimedphysio');
    expect(namespaceForRole('Finance Manager')).toBe('bimedstaff');
  });

  it('creates one stable direct conversation key regardless of sender order', () => {
    expect(directKey('staff-b', 'staff-a')).toBe(directKey('staff-a', 'staff-b'));
  });
});

describe('messaging admin permissions', () => {
  it('maps the admin message APIs to communications permission', () => {
    expect(permissionForAdminPath('/api/admin/messages')).toBe('communications.manage');
    expect(permissionForAdminPath('/api/admin/messages/abc')).toBe('communications.manage');
    expect(hasAdminPermission('recruitment', 'communications.manage')).toBe(true);
    expect(hasAdminPermission('finance', 'communications.manage')).toBe(false);
  });
});
