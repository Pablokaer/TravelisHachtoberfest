// Plan rules (D-047). The plans and their limits live in the database (`plans` table). Since
// D-065 no limit is enforced — every account creates as many walk lists as it wants, with as
// many places as a walking route holds (ROUTE_MAX_STOPS), and deletes its own — so the helpers
// that checked them (canCreateList, canAddItemToList, canDeleteList, itemCapacity,
// planLimitFromCode, PLAN_LIMIT_ERRORS) were removed; they are in git history (d7cf1fe) for when
// payments return. What stays is the shape the plans page shows.

/** A plan's limits; null means unlimited. */
export type PlanRules = {
  maxLists: number | null;
  maxItemsPerList: number | null;
  canDeleteLists: boolean;
};
