export type TradingCommandsConfig = Record<string, never>;

export const tradingCommandsConfigSchema = {
  parse(_value: unknown): TradingCommandsConfig {
    return {};
  },
};
