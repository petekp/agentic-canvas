// User utilities - centralized user ID management
// TODO: Wire to your auth system

/**
 * Get the current user ID.
 * Currently returns a default value - replace with your auth system.
 */
export function getCurrentUserId(): string {
  // TODO: Implement actual auth
  // Examples:
  // - NextAuth: getServerSession().user.id
  // - Clerk: auth().userId
  // - Supabase: supabase.auth.getUser().id
  return "default_user";
}

/**
 * Client-side user ID hook placeholder.
 * Replace with your auth provider's hook.
 */
export function useCurrentUserId(): string {
  // TODO: Implement actual auth hook
  // Examples:
  // - NextAuth: useSession().data?.user?.id
  // - Clerk: useUser().user?.id
  // - Supabase: useUser()?.id
  return "default_user";
}
