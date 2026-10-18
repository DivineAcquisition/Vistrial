/**
 * Exact rename of identifiers that named an outside company.
 * Access rules are unchanged; only the names moved.
 *
 * da_operator (org role)           -> placed_operator
 * stellar_da_operators (view)      -> placed_operators
 * stellar_da_access_log (table)    -> placed_access_log
 * is_stellar_da_operator()         -> is_placed_operator()
 * record_stellar_da_access()       -> record_placed_access()
 * stellar_da_list_placements()     -> placed_list_placements()
 * stellar_da_get_placement()       -> placed_get_placement()
 * Stellar auth kind "da_operator"  -> "placed_operator"
 *
 * placed_operator is not Workspace Operator and not Workspace Member.
 * The people who hold it are still active platform staff, scoped by assignment.
 */
export const ROLE_RENAMES: Record<string, string> = {
  da_operator: "placed_operator",
};

export function canonicalRole(role: string): string {
  return ROLE_RENAMES[role] ?? role;
}

export const PLACED_OPERATOR_ROLE = "placed_operator";

export function isPlacedOperatorRole(role: string): boolean {
  return role === PLACED_OPERATOR_ROLE || role === "da_operator";
}
