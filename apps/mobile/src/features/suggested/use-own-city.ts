// The traveller's own city (D-079): the one the app already has at their position, or one the
// local city builder is creating for them, with the stage it has reached.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LatLng } from '@wayfarer/shared';
import { useEffect } from 'react';

import { destinationKeys } from '@/features/destinations/api';
import type { BuildStage, CityBuilder, JobStatus, PlaceHint, ResolveResult } from './city-builder';

export type OwnCityPhase = 'idle' | 'resolving' | 'building' | 'ready' | 'unavailable' | 'failed';

export type OwnCity = {
  phase: OwnCityPhase;
  slug: string | null;
  stage: BuildStage | null;
  message: string | null;
  attractions: number | null;
  routes: number | null;
};

/** How often a running build is asked for its progress. */
const POLL_MS = 2000;

const IDLE: OwnCity = {
  phase: 'idle',
  slug: null,
  stage: null,
  message: null,
  attractions: null,
  routes: null,
};

/** Rounded to about a kilometre so small GPS jitter does not start a new lookup. */
const positionKey = (p: LatLng) => `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;

function fromResolve(resolved: ResolveResult, job: JobStatus | undefined): OwnCity {
  if (resolved.status === 'ready') return { ...IDLE, phase: 'ready', slug: resolved.citySlug };
  if (resolved.status === 'failed') return { ...IDLE, phase: 'failed', message: resolved.message };
  if (!job) return { ...IDLE, phase: 'building', stage: resolved.stage };
  const { status, stage, citySlug, message, attractions, routes } = job;
  const phase =
    status === 'ready' && citySlug ? 'ready' : status === 'failed' ? 'failed' : 'building';
  return { phase, slug: citySlug, stage, message, attractions, routes };
}

/**
 * Where "my city" is for this position. `builder` null means the service is not configured.
 * @example const own = useOwnCity(position, builder); // own.phase, own.slug, own.stage
 */
export function useOwnCity(
  position: LatLng | null,
  builder: CityBuilder | null,
  pollMs: number = POLL_MS,
  hint: PlaceHint | null = null,
): OwnCity {
  const queryClient = useQueryClient();
  const resolved = useQuery({
    queryKey: ['own-city', position ? positionKey(position) : null, hint?.name ?? null],
    enabled: !!position && !!builder,
    retry: false,
    staleTime: Infinity,
    queryFn: () => builder!.resolve(position!, hint),
  });
  const jobId = resolved.data?.status === 'building' ? resolved.data.jobId : null;
  const job = useQuery({
    queryKey: ['city-job', jobId],
    enabled: !!jobId && !!builder,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.status === 'building' || !query.state.data ? pollMs : false,
    queryFn: () => builder!.job(jobId!),
  });
  const built = job.data?.status === 'ready';
  useEffect(() => {
    // A finished build adds a city and its routes: lists loaded before must be read again.
    if (!built) return;
    void queryClient.invalidateQueries({ queryKey: destinationKeys.cities });
    void queryClient.invalidateQueries({ queryKey: ['suggestedRoutes'] });
  }, [built, queryClient]);

  if (!position) return IDLE;
  if (!builder || resolved.isError) return { ...IDLE, phase: 'unavailable' };
  if (!resolved.data) return { ...IDLE, phase: 'resolving' };
  return fromResolve(resolved.data, job.data);
}
