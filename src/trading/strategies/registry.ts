// Stub for tests — real implementation lives in main branch
export const listStrategies = async () => [];
export const getStrategy = async (_id: string) => null;
export const saveStrategy = async (s: unknown) => s;
export const deleteStrategy = async (_id: string) => false;
export const toggleStrategy = async (_id: string, _enabled: boolean) => null;
export const listExecutions = async (_strategyId?: string) => [];
export const clearExecutions = async (_strategyId: string) => 0;
