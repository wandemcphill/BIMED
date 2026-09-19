// Compatibility alias for the older recruitment application endpoint.
// Keep one authoritative lifecycle implementation so status gates, staff promotion,
// audit and security controls cannot drift between duplicate routes.
export { GET, PATCH, DELETE } from '@/app/api/admin/applications/[id]/route';
