/**
 * Narrow access to framework tables that are not yet in the generated
 * Database types. Application code still filters by org_id.
 */
export type AgentTableClient = {
  from: (table: string) => {
    select: (columns?: string, options?: object) => unknown;
    insert: (values: object | object[]) => unknown;
    update: (values: object) => unknown;
    upsert: (values: object | object[], options?: object) => unknown;
    delete: () => unknown;
  };
};

export function agentTable<T>(db: AgentTableClient, name: string): T {
  return db.from(name) as T;
}
