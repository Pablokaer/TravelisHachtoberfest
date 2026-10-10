import {
  checklistResponseSchema,
  type ChecklistRequest,
  type ChecklistResponse,
} from '@wayfarer/shared';
import { useQuery } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

async function invokeChecklist(body: ChecklistRequest): Promise<ChecklistResponse> {
  const { data, error } = await supabase.functions.invoke('checklist', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detail = await error.context.text().catch(() => '');
      throw new Error(detail || error.message);
    }
    throw error;
  }
  return checklistResponseSchema.parse(data);
}

export function useChecklist(request: ChecklistRequest | null) {
  return useQuery({
    queryKey: ['checklist', request],
    enabled: !!request,
    staleTime: 30 * 60_000,
    queryFn: () => invokeChecklist(request!),
  });
}
