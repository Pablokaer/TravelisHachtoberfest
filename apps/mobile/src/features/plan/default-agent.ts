// The planner's model client for this build (D-081); null when EXPO_PUBLIC_CITY_BUILDER_URL is
// unset, in which case the planner asks its fixed questions and ranks by score.
import { env } from '@/lib/env';
import { HttpPlanAgent, type PlanAgent } from './plan-agent';

export const defaultPlanAgent: PlanAgent | null = env.cityBuilderUrl
  ? new HttpPlanAgent(env.cityBuilderUrl)
  : null;
