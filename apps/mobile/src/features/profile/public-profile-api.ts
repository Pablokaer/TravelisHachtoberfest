// A traveller's public profile (D-045): name, photo, member since and number of public walk
// lists, read by the random public id that reviews, chat messages and walk lists link with.
import { useQuery } from '@tanstack/react-query';

import { avatarUrl } from '@/features/profile/avatar-api';
import { supabase } from '@/lib/supabase';

export type PublicProfile = {
  publicId: string;
  name: string | null;
  avatarUrl: string | null;
  memberSince: string;
  publicWalklistCount: number;
  /** The signed-in user's own profile. */
  isSelf: boolean;
};

export type PublicProfileView = { status: 'ok'; profile: PublicProfile } | { status: 'not_found' };

type PublicProfileResult =
  | {
      status: 'ok';
      profile: {
        public_id: string;
        name: string | null;
        avatar_path: string | null;
        member_since: string;
        public_walklist_count: number;
        is_self: boolean;
      };
    }
  | { status: 'not_found' };

/**
 * @example publicProfileFrom(await rpc('public_profile', …)).status // 'ok'
 */
export function publicProfileFrom(result: PublicProfileResult): PublicProfileView {
  if (result.status !== 'ok') return { status: 'not_found' };
  const p = result.profile;
  return {
    status: 'ok',
    profile: {
      publicId: p.public_id,
      name: p.name,
      avatarUrl: avatarUrl(p.avatar_path),
      memberSince: p.member_since,
      publicWalklistCount: p.public_walklist_count,
      isSelf: p.is_self,
    },
  };
}

/** The public profile of a traveller by their public id. */
export function usePublicProfile(publicId: string | undefined) {
  return useQuery({
    queryKey: ['publicProfile', publicId ?? ''] as const,
    enabled: !!publicId,
    queryFn: async (): Promise<PublicProfileView> => {
      const { data, error } = await supabase.rpc('public_profile', { p_public_id: publicId! });
      if (error) throw new Error(error.message);
      return publicProfileFrom(data as PublicProfileResult);
    },
  });
}

/** The public profile page (a query parameter, like /shared: no host rewrite needed). */
export const travellerHref = (publicId: string) =>
  ({ pathname: '/traveller', params: { id: publicId } }) as const;
